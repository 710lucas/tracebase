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

async function deleteTestEntities(): Promise<void> {
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

test(
  "refuses a batch with attributes until they can be stored",
  { skip: skipWithoutMemgraph },
  async () => {
    const attribute = createAttribute({
      entity: createEntity("IP_ADDRESS", "__test__93.184.216.34"),
      name: "banner",
      value: "nginx",
      provenance: createProvenance({ tool: "spiderfoot", run: "scan-1" }),
    });

    await assert.rejects(
      (await repository()).save({ relations: [], attributes: [attribute] }),
      /storing attributes in Memgraph is not implemented yet/,
    );
  },
);

test("says reading is not implemented yet", { skip: skipWithoutMemgraph }, async () => {
  await assert.rejects(
    (await repository()).findEntity(createEntity("IP_ADDRESS", "__test__1.1.1.1")),
    /reading an entity from Memgraph is not implemented yet/,
  );
});
