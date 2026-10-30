import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  connectToMemgraph,
  DEFAULT_MEMGRAPH_URL,
  type MemgraphConnection,
} from "../../../src/adapters/memgraph/memgraph-connection.ts";

// These tests need a running Memgraph with MAGE (see `docs/memgraph.md`), at `MEMGRAPH_URL` or the
// default address. When none answers, they are skipped and say so, so `npm run check` still passes on a
// machine without the database.
async function tryConnecting(): Promise<MemgraphConnection | null> {
  try {
    return await connectToMemgraph({ url: process.env["MEMGRAPH_URL"] ?? DEFAULT_MEMGRAPH_URL });
  } catch {
    return null;
  }
}

const connection = await tryConnecting();
const skipWithoutMemgraph = connection === null ? "no Memgraph is running" : false;

after(async () => {
  await connection?.close();
});

test(
  "runs a query and returns plain JavaScript values",
  { skip: skipWithoutMemgraph },
  async () => {
    const rows = await (connection as MemgraphConnection).run(
      'RETURN 1 AS one, "text" AS text, [1, 2] AS list, {a: {b: 2}} AS map',
    );

    assert.deepEqual(rows, [{ one: 1, text: "text", list: [1, 2], map: { a: { b: 2 } } }]);
  },
);

test(
  "passes parameters, including text with line breaks and maps",
  { skip: skipWithoutMemgraph },
  async () => {
    const value = "Docker Hub (User)\nhttps://hub.docker.com/u/710lucas";

    const rows = await (connection as MemgraphConnection).run(
      "RETURN $value AS value, $record AS record",
      { value, record: { tool: "spiderfoot", observedAt: 1762387200000 } },
    );

    assert.deepEqual(rows, [{ value, record: { tool: "spiderfoot", observedAt: 1762387200000 } }]);
  },
);

test(
  "stores and updates a map of maps, which the current attributes of an entity need",
  { skip: skipWithoutMemgraph },
  async () => {
    // Memgraph has no `map + map` and no `n.map["key"] = ...`; the MAGE functions below are how a map
    // property is updated, so the image must be `memgraph-mage`.
    const rows = await (connection as MemgraphConnection).run(
      `WITH map.set_key({WEBSERVER_BANNER: {value: "nginx"}}, "Server Name", {value: "x"}) AS attributes
     RETURN attributes["WEBSERVER_BANNER"].value AS banner, attributes["Server Name"].value AS name`,
    );

    assert.deepEqual(rows, [{ banner: "nginx", name: "x" }]);
  },
);

// Like the repository tests, these only create entities whose value starts with `__test__`.
async function countTransactionTestEntities(): Promise<unknown> {
  const rows = await (connection as MemgraphConnection).run(
    "MATCH (n:Entity) WHERE n.value STARTS WITH '__test__tx' RETURN count(n) AS count",
  );

  return rows[0]?.["count"];
}

test("runs several statements in one transaction", { skip: skipWithoutMemgraph }, async () => {
  const memgraph = connection as MemgraphConnection;

  await memgraph.runInTransaction([
    { query: "CREATE (:Entity {type: 'T', value: $value})", parameters: { value: "__test__tx1" } },
    { query: "CREATE (:Entity {type: 'T', value: $value})", parameters: { value: "__test__tx2" } },
  ]);

  assert.equal(await countTransactionTestEntities(), 2);

  await memgraph.run("MATCH (n:Entity) WHERE n.value STARTS WITH '__test__tx' DETACH DELETE n");
});

test(
  "keeps nothing of a transaction when one of its statements fails",
  { skip: skipWithoutMemgraph },
  async () => {
    await assert.rejects(
      (connection as MemgraphConnection).runInTransaction([
        {
          query: "CREATE (:Entity {type: 'T', value: $value})",
          parameters: { value: "__test__tx3" },
        },
        { query: "THIS IS NOT CYPHER", parameters: {} },
      ]),
    );

    assert.equal(await countTransactionTestEntities(), 0);
  },
);

test("says where it tried to connect when the database does not answer", async () => {
  await assert.rejects(
    connectToMemgraph({ url: "bolt://localhost:1" }),
    /could not reach Memgraph at bolt:\/\/localhost:1/,
  );
});
