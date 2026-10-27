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

test("says where it tried to connect when the database does not answer", async () => {
  await assert.rejects(
    connectToMemgraph({ url: "bolt://localhost:1" }),
    /could not reach Memgraph at bolt:\/\/localhost:1/,
  );
});
