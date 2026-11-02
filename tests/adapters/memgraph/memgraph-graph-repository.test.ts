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

// A single text is a set of one value; a list is the whole set the tool found together.
function attributeWith(
  values: string | string[],
  provenance: Partial<ProvenanceDTO> = {},
  name = "banner",
  entityValue = "__test__93.184.216.34",
) {
  return createAttribute({
    entity: createEntity("IP_ADDRESS", entityValue),
    name,
    values: typeof values === "string" ? [values] : values,
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
        values: ["nginx"],
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
    const attributes = row?.["attributes"] as Record<string, { values: string[] }>;

    assert.deepEqual(
      Object.entries(attributes)
        .map(([name, record]) => [name, record.values[0]])
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
     RETURN history.name AS name, history.values[0] AS value, history.run AS run,
            history.updatedAt AS updatedAt
     ORDER BY history.values[0]`,
  );
}

function currentBanner(row: Record<string, unknown> | undefined) {
  return (row?.["attributes"] as Record<string, { values: string[] }>)["banner"]?.values[0];
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

const target = createEntity("IP_ADDRESS", "__test__93.184.216.34");
const source = createEntity("DOMAIN_NAME", "__test__example.com");

function byValue<T extends { values: readonly string[] }>(items: readonly T[]) {
  return items.toSorted((a, b) => (a.values[0] ?? "").localeCompare(b.values[0] ?? ""));
}

test(
  "finds nothing for an entity no relation or attribute mentions",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();
    await graph.save({ relations: [relationWith()], attributes: [] });

    assert.equal(await graph.findEntity(createEntity("IP_ADDRESS", "__test__1.1.1.1")), null);
  },
);

test(
  "finds a relation from both of its ends, exactly as it was saved",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();
    const relation = createRelation({
      source,
      target,
      provenance: createProvenance({
        tool: "spiderfoot",
        run: "scan-1",
        module: "sfp_dnsresolve",
        confidence: 90,
        recordRef: "hash-1",
        observedAt: 1000,
        recordedAt: 2000,
      }),
      type: "resolves-to",
      viaRecordRefs: ["hash-via"],
    });

    await graph.save({ relations: [relation], attributes: [] });

    assert.deepEqual(await graph.findEntity(source), {
      entity: source,
      relations: [relation],
      attributes: [],
    });
    assert.deepEqual(await graph.findEntity(target), {
      entity: target,
      relations: [relation],
      attributes: [],
    });
  },
);

test(
  "finds a relation that has only the required fields",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();
    const relation = relationWith();

    await graph.save({ relations: [relation], attributes: [] });

    assert.deepEqual((await graph.findEntity(source))?.relations, [relation]);
  },
);

test(
  "finds the same link seen by two runs as two relations",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();
    const first = relationWith({ run: "scan-1" });
    const second = relationWith({ run: "scan-2" });

    await graph.save({ relations: [first, second], attributes: [] });

    const found = await graph.findEntity(source);

    assert.deepEqual(found?.relations.map((relation) => relation.provenance.run).toSorted(), [
      "scan-1",
      "scan-2",
    ]);
  },
);

test("finds a relation from an entity to itself once", { skip: skipWithoutMemgraph }, async () => {
  const graph = await repository();
  const relation = createRelation({
    source,
    target: source,
    provenance: createProvenance({ tool: "spiderfoot", run: "scan-1" }),
  });

  await graph.save({ relations: [relation], attributes: [] });

  assert.deepEqual((await graph.findEntity(source))?.relations, [relation]);
});

test(
  "finds the current attributes and the replaced values, each with its provenance",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();
    const nginx = attributeWith("nginx", { run: "scan-1", module: "sfp_a", observedAt: 1000 });
    const apache = attributeWith("apache", { run: "scan-2", observedAt: 5000 });
    const linux = attributeWith("Linux", { run: "scan-1" }, "os");

    await graph.save({ relations: [], attributes: [nginx, apache, linux] });

    const found = await graph.findEntity(target);

    assert.deepEqual(byValue(found?.attributes ?? []), byValue([apache, linux, nginx]));
  },
);

test("finds only what concerns the entity asked for", { skip: skipWithoutMemgraph }, async () => {
  const graph = await repository();
  const other = createEntity("IP_ADDRESS", "__test__10.0.0.1");
  const relation = relationWith();
  const unrelated = createRelation({
    source: other,
    target: createEntity("DOMAIN_NAME", "__test__other.org"),
    provenance: createProvenance({ tool: "spiderfoot", run: "scan-1" }),
  });

  await graph.save({
    relations: [relation, unrelated],
    attributes: [attributeWith("nginx", {}, "banner", "__test__10.0.0.1")],
  });

  assert.deepEqual((await graph.findEntity(target))?.relations, [relation]);
  assert.deepEqual((await graph.findEntity(target))?.attributes, []);
});

// Attributes are sets: values the tool found together are ONE record, never a record per value.
const HEADERS = ["x-runtime: 0.2", "x-cache: Miss", "x-request-queueing: 0"];

test(
  "several values found together are stored as one current record, with no history",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();

    await graph.save({
      relations: [],
      attributes: [attributeWith(HEADERS, { observedAt: 1000 }, "headers")],
    });

    const record = (
      (await readAttributes())?.["attributes"] as Record<string, { values: string[] }>
    )["headers"];

    assert.deepEqual(record?.values, [...HEADERS].sort());
    assert.deepEqual(await readHistory(), []);
  },
);

test(
  "a newer set replaces the old one, which is kept as a single node holding its whole set",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();

    await graph.save({
      relations: [],
      attributes: [attributeWith(HEADERS, { run: "scan-1", observedAt: 1000 }, "headers")],
    });
    await graph.save({
      relations: [],
      attributes: [
        attributeWith(HEADERS.slice(0, 2), { run: "scan-2", observedAt: 5000 }, "headers"),
      ],
    });

    const current = (
      (await readAttributes())?.["attributes"] as Record<string, { values: string[]; run: string }>
    )["headers"];
    const history = await (connection as MemgraphConnection).run(
      `MATCH (:Entity {value: '__test__93.184.216.34'})-[:HAS_ATTRIBUTE]->(h:Attribute)
       RETURN h.name AS name, h.values AS values, h.run AS run`,
    );

    assert.deepEqual(current?.values, HEADERS.slice(0, 2).sort());
    assert.equal(current?.run, "scan-2");
    assert.deepEqual(history, [{ name: "headers", values: [...HEADERS].sort(), run: "scan-1" }]);
  },
);

test(
  "the same set sent again by a later run only moves updatedAt",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();

    await graph.save({
      relations: [],
      attributes: [attributeWith(HEADERS, { run: "scan-1", observedAt: 1000 }, "headers")],
    });
    await graph.save({
      relations: [],
      attributes: [
        attributeWith([...HEADERS].reverse(), { run: "scan-2", observedAt: 5000 }, "headers"),
      ],
    });

    const record = (
      (await readAttributes())?.["attributes"] as Record<string, Record<string, unknown>>
    )["headers"];

    assert.equal(record?.["run"], "scan-1");
    assert.equal(record?.["updatedAt"], 5000);
    assert.deepEqual(await readHistory(), []);
  },
);

test("reads a set back as one attribute", { skip: skipWithoutMemgraph }, async () => {
  const graph = await repository();
  const observation = attributeWith(HEADERS, { observedAt: 1000 }, "headers");

  await graph.save({ relations: [], attributes: [observation] });
  const found = await graph.findEntity(observation.entity);

  assert.deepEqual(found?.attributes, [observation]);
});
