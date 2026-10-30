import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  connectToMemgraph,
  DEFAULT_MEMGRAPH_URL,
  type MemgraphConnection,
} from "../../../src/adapters/memgraph/memgraph-connection.ts";
import { createMemgraphGraphRepository } from "../../../src/adapters/memgraph/memgraph-graph-repository.ts";
import { createAttribute } from "../../../src/core/domain/attribute/index.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";
import { createProvenance, type ProvenanceDTO } from "../../../src/core/domain/provenance/index.ts";
import { createRelation } from "../../../src/core/domain/relation/index.ts";

// Needs a running Memgraph, like the connection tests; skipped when none answers.
//
// The database may hold other data (the developer's own graphs). These tests only create entities whose
// value starts with `__test__` and delete exactly those, so they never touch anything else.
async function tryConnecting(): Promise<MemgraphConnection | null> {
  try {
    return await connectToMemgraph({ url: process.env["MEMGRAPH_URL"] ?? DEFAULT_MEMGRAPH_URL });
  } catch {
    return null;
  }
}

const connection = await tryConnecting();
const skipWithoutMemgraph = connection === null ? "no Memgraph is running" : false;

// The replaced attribute values are nodes of their own, so they go first: deleting the entity alone
// would leave them behind.
async function deleteTestEntities(): Promise<void> {
  await connection?.run(
    "MATCH (n:Entity)-[:HAS_ATTRIBUTE]->(history:Attribute) WHERE n.value STARTS WITH '__test__' DETACH DELETE history",
  );
  await connection?.run("MATCH (n:Entity) WHERE n.value STARTS WITH '__test__' DETACH DELETE n");
}

beforeEach(deleteTestEntities);

after(async () => {
  await deleteTestEntities();
  await connection?.close();
});

function relationWith(provenance: Partial<ProvenanceDTO> = {}, type?: string) {
  return createRelation({
    source: createEntity("DOMAIN_NAME", "__test__example.com"),
    target: createEntity("IP_ADDRESS", "__test__93.184.216.34"),
    provenance: createProvenance({ tool: "spiderfoot", run: "scan-1", ...provenance }),
    ...(type !== undefined && { type }),
  });
}

async function repository() {
  return createMemgraphGraphRepository(connection as MemgraphConnection);
}

test(
  "stores the entities with their type label and the relation between them",
  { skip: skipWithoutMemgraph },
  async () => {
    await (
      await repository()
    ).save({
      relations: [
        relationWith({ module: "sfp_dnsresolve", confidence: 90, recordedAt: 2000 }, "resolves-to"),
      ],
      attributes: [],
    });

    const rows = await (connection as MemgraphConnection).run(
      `MATCH (s:Entity)-[r]->(t:Entity) WHERE s.value STARTS WITH '__test__'
       RETURN labels(s) AS sourceLabels, labels(t) AS targetLabels, type(r) AS edge, properties(r) AS properties`,
    );

    assert.equal(rows.length, 1);
    assert.deepEqual((rows[0]?.["sourceLabels"] as string[]).toSorted(), ["DOMAIN_NAME", "Entity"]);
    assert.deepEqual((rows[0]?.["targetLabels"] as string[]).toSorted(), ["Entity", "IP_ADDRESS"]);
    assert.equal(rows[0]?.["edge"], "RESOLVES_TO");
    assert.deepEqual(rows[0]?.["properties"], {
      key: (rows[0]?.["properties"] as { key: string }).key,
      tool: "spiderfoot",
      run: "scan-1",
      module: "sfp_dnsresolve",
      confidence: 90,
      recordedAt: 2000,
      type: "resolves-to",
    });
  },
);

test("a relation with no type is stored as RELATED", { skip: skipWithoutMemgraph }, async () => {
  await (await repository()).save({ relations: [relationWith()], attributes: [] });

  const rows = await (connection as MemgraphConnection).run(
    "MATCH (s:Entity)-[r]->(:Entity) WHERE s.value STARTS WITH '__test__' RETURN type(r) AS edge",
  );

  assert.deepEqual(rows, [{ edge: "RELATED" }]);
});

test(
  "saving the same import twice leaves one node per entity and one edge",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();
    const batch = { relations: [relationWith()], attributes: [] };

    await graph.save(batch);
    await graph.save(batch);

    const rows = await (connection as MemgraphConnection).run(
      `MATCH (n:Entity) WHERE n.value STARTS WITH '__test__'
       OPTIONAL MATCH (n)-[r]->(:Entity)
       RETURN count(DISTINCT n) AS nodes, count(r) AS edges`,
    );

    assert.deepEqual(rows, [{ nodes: 2, edges: 1 }]);
  },
);

test(
  "the same link found by two modules stays as two edges",
  { skip: skipWithoutMemgraph },
  async () => {
    await (
      await repository()
    ).save({
      relations: [relationWith({ module: "sfp_a" }), relationWith({ module: "sfp_b" })],
      attributes: [],
    });

    const rows = await (connection as MemgraphConnection).run(
      `MATCH (s:Entity)-[r]->(:Entity) WHERE s.value STARTS WITH '__test__'
       RETURN r.module AS module ORDER BY module`,
    );

    assert.deepEqual(rows, [{ module: "sfp_a" }, { module: "sfp_b" }]);
  },
);

test(
  "a second write of the same finding does not change what the first one recorded",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();

    await graph.save({ relations: [relationWith({ recordedAt: 1000 })], attributes: [] });
    await graph.save({ relations: [relationWith({ recordedAt: 9000 })], attributes: [] });

    const rows = await (connection as MemgraphConnection).run(
      "MATCH (s:Entity)-[r]->(:Entity) WHERE s.value STARTS WITH '__test__' RETURN r.recordedAt AS recordedAt",
    );

    assert.deepEqual(rows, [{ recordedAt: 1000 }]);
  },
);

function attributeWith(
  value: string,
  provenance: Partial<ProvenanceDTO> = {},
  name = "banner",
  entityValue = "__test__93.184.216.34",
) {
  return createAttribute({
    entity: createEntity("IP_ADDRESS", entityValue),
    name,
    value,
    provenance: createProvenance({ tool: "spiderfoot", run: "scan-1", ...provenance }),
  });
}

async function readAttributes(entityValue = "__test__93.184.216.34") {
  const rows = await (connection as MemgraphConnection).run(
    "MATCH (n:Entity {value: $value}) RETURN labels(n) AS labels, n.attributes AS attributes",
    { value: entityValue },
  );

  return rows[0];
}

test(
  "stores an attribute as the current record in the attributes map of its entity",
  { skip: skipWithoutMemgraph },
  async () => {
    const attribute = attributeWith("nginx", {
      module: "sfp_portscan_tcp",
      confidence: 80,
      recordedAt: 2000,
    });

    await (await repository()).save({ relations: [], attributes: [attribute] });

    const row = await readAttributes();

    // An attribute on an entity no relation mentions still creates the entity, with its type label.
    assert.deepEqual((row?.["labels"] as string[]).toSorted(), ["Entity", "IP_ADDRESS"]);
    assert.deepEqual(row?.["attributes"], {
      banner: {
        value: "nginx",
        tool: "spiderfoot",
        run: "scan-1",
        module: "sfp_portscan_tcp",
        confidence: 80,
        recordedAt: 2000,
        key: (row?.["attributes"] as { banner: { key: string } }).banner.key,
      },
    });
  },
);

test(
  "keeps one record per attribute name, even in the same batch",
  { skip: skipWithoutMemgraph },
  async () => {
    await (
      await repository()
    ).save({
      relations: [],
      attributes: [attributeWith("nginx"), attributeWith("Linux", {}, "os with spaces")],
    });

    const row = await readAttributes();
    const attributes = row?.["attributes"] as Record<string, { value: string }>;

    assert.deepEqual(
      Object.entries(attributes)
        .map(([name, record]) => [name, record.value])
        .toSorted(),
      [
        ["banner", "nginx"],
        ["os with spaces", "Linux"],
      ],
    );
  },
);

test(
  "keeps the records of the other attributes when one is added later",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();

    await graph.save({ relations: [], attributes: [attributeWith("nginx")] });
    await graph.save({ relations: [], attributes: [attributeWith("Linux", {}, "os")] });

    const row = await readAttributes();

    assert.deepEqual(Object.keys(row?.["attributes"] as object).toSorted(), ["banner", "os"]);
  },
);

test("saving the same attribute twice changes nothing", { skip: skipWithoutMemgraph }, async () => {
  const graph = await repository();
  const batch = { relations: [], attributes: [attributeWith("nginx", { observedAt: 1000 })] };

  await graph.save(batch);
  const afterFirst = await readAttributes();
  await graph.save(batch);

  assert.deepEqual(await readAttributes(), afterFirst);
});

test(
  "the same value seen again later only moves updatedAt, and keeps the first provenance",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();

    await graph.save({
      relations: [],
      attributes: [attributeWith("nginx", { run: "scan-1", observedAt: 1000 })],
    });
    await graph.save({
      relations: [],
      attributes: [attributeWith("nginx", { run: "scan-2", observedAt: 5000 })],
    });

    const row = await readAttributes();
    const record = (row?.["attributes"] as Record<string, Record<string, unknown>>)["banner"];

    assert.equal(record?.["run"], "scan-1");
    assert.equal(record?.["observedAt"], 1000);
    assert.equal(record?.["updatedAt"], 5000);
  },
);

async function readHistory() {
  return (connection as MemgraphConnection).run(
    `MATCH (:Entity {value: '__test__93.184.216.34'})-[:HAS_ATTRIBUTE]->(history:Attribute)
     RETURN history.name AS name, history.value AS value, history.run AS run,
            history.updatedAt AS updatedAt
     ORDER BY history.value`,
  );
}

function currentBanner(row: Record<string, unknown> | undefined) {
  return (row?.["attributes"] as Record<string, { value: string }>)["banner"]?.value;
}

test(
  "a newer different value becomes current and the old one is kept as a node with its provenance",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();

    await graph.save({
      relations: [],
      attributes: [attributeWith("nginx", { run: "scan-1", observedAt: 1000 })],
    });
    await graph.save({
      relations: [],
      attributes: [attributeWith("apache", { run: "scan-2", observedAt: 5000 })],
    });

    assert.equal(currentBanner(await readAttributes()), "apache");
    assert.deepEqual(await readHistory(), [
      { name: "banner", value: "nginx", run: "scan-1", updatedAt: null },
    ]);
  },
);

test(
  "a different value that arrives late is kept as a node and the current one stays",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();

    await graph.save({
      relations: [],
      attributes: [attributeWith("apache", { run: "scan-2", observedAt: 5000 })],
    });
    await graph.save({
      relations: [],
      attributes: [attributeWith("nginx", { run: "scan-1", observedAt: 1000 })],
    });

    assert.equal(currentBanner(await readAttributes()), "apache");
    assert.deepEqual(await readHistory(), [
      { name: "banner", value: "nginx", run: "scan-1", updatedAt: null },
    ]);
  },
);

test(
  "sending the same history again leaves one node per replaced value",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();
    const batch = {
      relations: [],
      attributes: [
        attributeWith("nginx", { run: "scan-1", observedAt: 1000 }),
        attributeWith("apache", { run: "scan-2", observedAt: 2000 }),
        attributeWith("caddy", { run: "scan-3", observedAt: 3000 }),
      ],
    };

    await graph.save(batch);
    await graph.save(batch);

    const nodes = await (connection as MemgraphConnection).run(
      "MATCH (history:Attribute) WHERE history.name = 'banner' AND history.run STARTS WITH 'scan-' " +
        "AND (:Entity {value: '__test__93.184.216.34'})-[:HAS_ATTRIBUTE]->(history) " +
        "RETURN count(history) AS nodes",
    );

    assert.equal(currentBanner(await readAttributes()), "caddy");
    assert.deepEqual(
      (await readHistory()).map((row) => row["value"]),
      ["apache", "nginx"],
    );
    assert.deepEqual(nodes, [{ nodes: 2 }]);
  },
);

test(
  "a value that comes back is the new current one and its old node stays",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();

    for (const [value, run, observedAt] of [
      ["nginx", "scan-1", 1000],
      ["apache", "scan-2", 2000],
      ["nginx", "scan-3", 3000],
    ] as const) {
      await graph.save({ relations: [], attributes: [attributeWith(value, { run, observedAt })] });
    }

    const row = await readAttributes();

    assert.equal(currentBanner(row), "nginx");
    assert.equal((row?.["attributes"] as Record<string, { run: string }>)["banner"]?.run, "scan-3");
    assert.deepEqual(
      (await readHistory()).map((history) => [history["value"], history["run"]]),
      [
        ["apache", "scan-2"],
        ["nginx", "scan-1"],
      ],
    );
  },
);

test(
  "the history of a replaced value keeps the updatedAt it had",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();

    await graph.save({
      relations: [],
      attributes: [attributeWith("nginx", { run: "scan-1", observedAt: 1000 })],
    });
    await graph.save({
      relations: [],
      attributes: [attributeWith("nginx", { run: "scan-2", observedAt: 3000 })],
    });
    await graph.save({
      relations: [],
      attributes: [attributeWith("apache", { run: "scan-3", observedAt: 5000 })],
    });

    assert.deepEqual(await readHistory(), [
      { name: "banner", value: "nginx", run: "scan-1", updatedAt: 3000 },
    ]);
  },
);

test("says reading is not implemented yet", { skip: skipWithoutMemgraph }, async () => {
  await assert.rejects(
    (await repository()).findEntity(createEntity("IP_ADDRESS", "__test__1.1.1.1")),
    /reading an entity from Memgraph is not implemented yet/,
  );
});
