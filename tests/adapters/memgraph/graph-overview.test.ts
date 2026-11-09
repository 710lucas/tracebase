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
import { createProvenance } from "../../../src/core/domain/provenance/index.ts";
import { createRelation } from "../../../src/core/domain/relation/index.ts";

// Needs a running Memgraph; skipped when none answers. The database may hold other data (the proof of
// slice 4f, the developer's own graphs) and other test files write to it at the same time, so these tests
// never assert on the whole graph: they use their own tool name, their own entity type and their own
// value prefix.
async function tryConnecting(): Promise<MemgraphConnection | null> {
  try {
    return await connectToMemgraph({ url: process.env["MEMGRAPH_URL"] ?? DEFAULT_MEMGRAPH_URL });
  } catch {
    return null;
  }
}

const connection = await tryConnecting();
const skipWithoutMemgraph = connection === null ? "no Memgraph is running" : false;

async function deleteTestEntities(): Promise<void> {
  await connection?.run(
    "MATCH (n:Entity)-[:HAS_ATTRIBUTE]->(history:Attribute) WHERE n.value STARTS WITH '__test_overview__' DETACH DELETE history",
  );
  await connection?.run(
    "MATCH (n:Entity) WHERE n.value STARTS WITH '__test_overview__' DETACH DELETE n",
  );
}

beforeEach(deleteTestEntities);

after(async () => {
  await deleteTestEntities();
  await connection?.close();
});

// Test files run in parallel against the same database, and the other Memgraph tests delete everything
// that starts with `__test__`. This file has its own prefix, which does not start with that, so neither
// side deletes the other's data.
const PREFIX = "__test_overview__";
const TOOL = "__test_overview__tool";
const TYPE = "TESTTYPE";

function entity(value: string) {
  return createEntity(TYPE, `${PREFIX}${value}`);
}

function relation(source: string, target: string, run: string, recordedAt: number) {
  return createRelation({
    source: entity(source),
    target: entity(target),
    provenance: createProvenance({ tool: TOOL, run, recordedAt }),
  });
}

function banner(value: string, run: string, recordedAt: number) {
  return createAttribute({
    entity: entity("a"),
    name: "banner",
    values: [value],
    provenance: createProvenance({ tool: TOOL, run, recordedAt }),
  });
}

async function repository() {
  return createMemgraphGraphRepository(connection as MemgraphConnection);
}

test(
  "lists a run with the relations and attribute values it brought, replaced ones included",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();
    await graph.save({ relations: [relation("a", "b", "run-a", 1000)], attributes: [] });
    await graph.save({
      relations: [],
      attributes: [banner("nginx", "run-a", 1000)],
    });
    // A newer value from another run replaces the first: the first becomes a history node.
    await graph.save({ relations: [], attributes: [banner("apache", "run-b", 2000)] });

    const runs = (await graph.listRuns()).filter((run) => run.tool === TOOL);

    assert.deepEqual(runs, [
      { tool: TOOL, run: "run-b", relations: 0, attributes: 1, receivedAt: 2000 },
      { tool: TOOL, run: "run-a", relations: 1, attributes: 1, receivedAt: 1000 },
    ]);
  },
);

// The graph holds other data, so the totals cannot be compared with an exact number: they must be at
// least what this test saved.
test("the totals include what a save added", { skip: skipWithoutMemgraph }, async () => {
  const graph = await repository();

  await graph.save({
    relations: [relation("a", "b", "run-a", 1000)],
    attributes: [banner("nginx", "run-a", 1000), banner("apache", "run-b", 2000)],
  });
  const totals = await graph.graphTotals();

  assert.ok(totals.entities >= 2);
  assert.ok(totals.relations >= 1);
  assert.ok(totals.attributes >= 2);
});

test("counts the entities of each type", { skip: skipWithoutMemgraph }, async () => {
  const graph = await repository();
  await graph.save({
    relations: [relation("a", "b", "run-a", 1000), relation("b", "c", "run-a", 1000)],
    attributes: [],
  });

  const types = await graph.listEntityTypes();

  assert.deepEqual(
    types.find((type) => type.type === TYPE),
    { type: TYPE, count: 3 },
  );
});

test(
  "lists the entities of a type in pages ordered by value, and filters by text",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();
    await graph.save({
      relations: [relation("c", "a", "run-a", 1000), relation("a", "b", "run-a", 1000)],
      attributes: [],
    });

    const page = await graph.listEntities({ type: TYPE, limit: 2, offset: 1 });
    // The prefix has no "a", so only the value that ends in "a" matches, whatever the case.
    const filtered = await graph.listEntities({ type: TYPE, search: "A", limit: 10, offset: 0 });
    const other = await graph.listEntities({ type: "NOSUCHTYPE", limit: 10, offset: 0 });

    assert.equal(page.total, 3);
    assert.deepEqual(page.entities, [entity("b"), entity("c")]);
    assert.equal(filtered.total, 1);
    assert.deepEqual(filtered.entities, [entity("a")]);
    assert.deepEqual(other, { total: 0, entities: [] });
  },
);

test(
  "filters the entity list by the match mode: exact, contains, or ignoring case and accents",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();
    await graph.save({
      relations: [
        relation("café", "CAFÉ", "run-m", 1000),
        relation("café bom", "cafe", "run-m", 1000),
      ],
      attributes: [],
    });
    const list = async (search: string, match?: "exact" | "contains" | "insensitive") =>
      (
        await graph.listEntities({
          type: TYPE,
          search: `${PREFIX}${search}`,
          ...(match !== undefined && { match }),
          limit: 10,
          offset: 0,
        })
      ).entities.map(({ value }) => value.slice(PREFIX.length));

    assert.deepEqual(await list("café", "exact"), ["café"]);
    assert.deepEqual(await list("café", "contains"), ["café", "café bom"]);
    // By default case and accents are ignored, in both directions.
    assert.deepEqual(await list("cafe"), ["CAFÉ", "café", "cafe", "café bom"].sort());
    assert.deepEqual(await list("CAFÉ"), await list("cafe"));
  },
);

// The current records sit in a map of maps (name, then qualifier), so the counting queries unwind two
// levels: sets with different qualifiers must each count.
test(
  "counts sets with different qualifiers, in the totals and in the run",
  { skip: skipWithoutMemgraph },
  async () => {
    const graph = await repository();
    const qualified = (qualifier: string) =>
      createAttribute({
        entity: entity("a"),
        name: "list",
        qualifier,
        values: [qualifier],
        provenance: createProvenance({ tool: TOOL, run: "run-q", recordedAt: 1000 }),
      });

    await graph.save({ relations: [], attributes: [qualified("sfp_a"), qualified("sfp_b")] });
    const after = await graph.graphTotals();
    const run = (await graph.listRuns()).find((item) => item.run === "run-q");

    // A lower bound, not a difference: other test files add and delete their own data at the same time.
    assert.ok(after.attributes >= 2);
    assert.equal(run?.attributes, 2);
  },
);
