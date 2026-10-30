import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEntityWrites } from "../../../src/adapters/memgraph/build-entity-writes.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";

test("writes nothing for no entities", () => {
  assert.deepEqual(buildEntityWrites([]), []);
});

test("writes one query per type label, with the type label next to :Entity", () => {
  const statements = buildEntityWrites([
    createEntity("DOMAIN_NAME", "example.com"),
    createEntity("IP_ADDRESS", "93.184.216.34"),
  ]);

  assert.deepEqual(
    statements.map((statement) => statement.query),
    [
      "UNWIND $rows AS row MERGE (n:Entity {type: row.type, value: row.value}) SET n:DOMAIN_NAME",
      "UNWIND $rows AS row MERGE (n:Entity {type: row.type, value: row.value}) SET n:IP_ADDRESS",
    ],
  );
});

test("sends an entity that appears several times once", () => {
  const statements = buildEntityWrites([
    createEntity("IP_ADDRESS", "93.184.216.34"),
    createEntity("IP_ADDRESS", "10.0.0.1"),
    createEntity("IP_ADDRESS", "93.184.216.34"),
  ]);

  assert.equal(statements.length, 1);
  assert.deepEqual(statements[0]?.parameters, {
    rows: [
      { type: "IP_ADDRESS", value: "93.184.216.34" },
      { type: "IP_ADDRESS", value: "10.0.0.1" },
    ],
  });
});

test("an entity type that cannot make a label is written with :Entity only", () => {
  const [statement] = buildEntityWrites([createEntity("---", "x")]);

  assert.equal(
    statement?.query,
    "UNWIND $rows AS row MERGE (n:Entity {type: row.type, value: row.value})",
  );
});

test("an entity type trying to break out of the query never reaches it", () => {
  const hostile = "x) DETACH DELETE n //";

  const [statement] = buildEntityWrites([createEntity(hostile, "x")]);

  assert.ok(statement?.query.includes("SET n:X_DETACH_DELETE_N"));
  assert.ok(!statement?.query.includes(hostile) && !statement?.query.includes("//"));
});
