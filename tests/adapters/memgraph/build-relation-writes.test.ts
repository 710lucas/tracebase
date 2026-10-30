import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRelationWrites } from "../../../src/adapters/memgraph/build-relation-writes.ts";
import { relationKey } from "../../../src/adapters/memgraph/relation-key.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";
import { createProvenance, type ProvenanceDTO } from "../../../src/core/domain/provenance/index.ts";
import { createRelation } from "../../../src/core/domain/relation/index.ts";

interface Overrides {
  targetValue?: string;
  type?: string;
  viaRecordRefs?: string[];
  provenance?: Partial<ProvenanceDTO>;
}

function relationWith(overrides: Overrides = {}) {
  return createRelation({
    source: createEntity("DOMAIN_NAME", "example.com"),
    target: createEntity("IP_ADDRESS", overrides.targetValue ?? "93.184.216.34"),
    provenance: createProvenance({ tool: "spiderfoot", run: "scan-1", ...overrides.provenance }),
    ...(overrides.type !== undefined && { type: overrides.type }),
    ...(overrides.viaRecordRefs !== undefined && { viaRecordRefs: overrides.viaRecordRefs }),
  });
}

test("writes nothing for a batch with no relations", () => {
  assert.deepEqual(buildRelationWrites([]), []);
});

test("a relation with no type is written on a RELATED edge, found or created by its key", () => {
  const statements = buildRelationWrites([relationWith()]);

  assert.deepEqual(
    statements.map((statement) => statement.query),
    [
      "UNWIND $rows AS row " +
        "MATCH (source:Entity {type: row.sourceType, value: row.sourceValue}) " +
        "MATCH (target:Entity {type: row.targetType, value: row.targetValue}) " +
        "MERGE (source)-[edge:RELATED {key: row.key}]->(target) " +
        "ON CREATE SET edge += row.properties",
    ],
  );
});

test("writes one query per edge label", () => {
  const statements = buildRelationWrites([
    relationWith({ type: "resolves_to" }),
    relationWith({ type: "Resolves To", targetValue: "10.0.0.1" }),
    relationWith({ type: "owns", targetValue: "10.0.0.2" }),
  ]);

  assert.equal(statements.length, 2);
  assert.match(statements[0]?.query ?? "", /\[edge:RESOLVES_TO \{key: row\.key\}\]/);
  assert.match(statements[1]?.query ?? "", /\[edge:OWNS \{key: row\.key\}\]/);
  assert.equal((statements[0]?.parameters["rows"] as unknown[]).length, 2);
});

test("an edge row carries the key, both ends and only the properties the tool sent", () => {
  const relation = relationWith({
    type: "resolves_to",
    viaRecordRefs: ["hash-via"],
    provenance: { module: "sfp_dnsresolve", confidence: 90, recordedAt: 2000 },
  });

  const [statement] = buildRelationWrites([relation]);

  assert.deepEqual(statement?.parameters, {
    rows: [
      {
        key: relationKey(relation),
        sourceType: "DOMAIN_NAME",
        sourceValue: "example.com",
        targetType: "IP_ADDRESS",
        targetValue: "93.184.216.34",
        properties: {
          tool: "spiderfoot",
          run: "scan-1",
          module: "sfp_dnsresolve",
          confidence: 90,
          recordedAt: 2000,
          type: "resolves_to",
          viaRecordRefs: ["hash-via"],
        },
      },
    ],
  });
});

test("a relation type trying to break out of the query never reaches it", () => {
  const hostile = "x) DETACH DELETE n //";

  const [statement] = buildRelationWrites([relationWith({ type: hostile })]);

  // Only the normalized label is written (`X_DETACH_DELETE_N`): the original text, with its `)` and
  // `//`, travels as a parameter.
  assert.ok(statement?.query.includes(":X_DETACH_DELETE_N"));
  assert.ok(!statement?.query.includes(hostile) && !statement?.query.includes("//"));
});
