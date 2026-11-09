import { test } from "node:test";
import assert from "node:assert/strict";
import { assertReadOnlyCypher } from "../../../src/adapters/memgraph/cypher-guard.ts";
import { InvalidCypherError } from "../../../src/core/ports/cypher-reader/index.ts";

const accepted = [
  "MATCH (n:Entity) RETURN n LIMIT 5",
  "match (n:Entity) return count(n)",
  "OPTIONAL MATCH (n:Entity) RETURN n",
  "UNWIND [1, 2, 3] AS x RETURN x",
  "WITH 1 AS one RETURN one",
  "RETURN 1;",
  "MATCH (n:Entity) WHERE n.value CONTAINS 'create or delete; set' RETURN n",
  'MATCH (n:Entity) WHERE n.value = "a \\" CALL" RETURN n',
  "MATCH (n:`Set Of Things`) RETURN n",
  "MATCH (n:Entity) RETURN n.set, n.call, n.attributes.create",
  "MATCH (n:Entity) WHERE n.type = $load RETURN n",
  "MATCH (n:Entity) // delete everything\nRETURN n",
  "MATCH (n:Entity) /* SET n.x = 1; */ RETURN n",
];

for (const statement of accepted) {
  test(`accepts ${JSON.stringify(statement)}`, () => {
    assert.doesNotThrow(() => assertReadOnlyCypher(statement));
  });
}

const refused: [string, RegExp][] = [
  ["", /empty/],
  ["   ;  ", /empty/],
  ["// only a comment", /empty/],
  ["CREATE (n:Entity)", /start with/],
  ["SHOW TRANSACTIONS", /start with/],
  ["FREE MEMORY", /start with/],
  ["LOAD CSV FROM '/etc/hostname' AS row RETURN row", /start with/],
  ["MATCH (n) CREATE (m) RETURN m", /CREATE is not accepted/],
  ["MATCH (n) SET n.x = 1", /SET is not accepted/],
  ["match (n) delete n", /DELETE is not accepted/],
  ["MATCH (n) DETACH DELETE n", /DETACH is not accepted/],
  ["MATCH (n) REMOVE n.x", /REMOVE is not accepted/],
  ["MERGE (n:Entity {type: 'T'})", /start with/],
  ["MATCH (n) FOREACH (x IN [1] | SET n.y = x)", /FOREACH is not accepted/],
  ["WITH 1 AS x CALL mg.procedures() YIELD name RETURN name", /CALL is not accepted/],
  ["MATCH (n) RETURN n LIMIT 1; MATCH (m) RETURN m", /only one statement/],
  ["MATCH (n) RETURN n QUERY MEMORY LIMIT 10GB", /memoryLimitMb/],
  ["MATCH (n) WHERE n.value = 'open RETURN n", /quote is opened/],
  ["MATCH (n:`open) RETURN n", /quote is opened/],
  ["MATCH (n) /* open RETURN n", /comment is opened/],
];

for (const [statement, reason] of refused) {
  test(`refuses ${JSON.stringify(statement)}`, () => {
    assert.throws(
      () => assertReadOnlyCypher(statement),
      (error) => error instanceof InvalidCypherError && reason.test(error.message),
    );
  });
}
