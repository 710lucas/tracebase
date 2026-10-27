import { test } from "node:test";
import assert from "node:assert/strict";
import { toEdgeLabel, toEntityLabel } from "../../../src/adapters/memgraph/to-cypher-label.ts";

const NORMALIZED_TEXTS: [string, string][] = [
  ["IP_ADDRESS", "IP_ADDRESS"],
  ["resolves_to", "RESOLVES_TO"],
  [" Domain Name ", "DOMAIN_NAME"],
  ["resolves-to", "RESOLVES_TO"],
  ["a--b__c", "A_B_C"],
  ["Conexão", "CONEXAO"],
  ["has.part/of", "HAS_PART_OF"],
  ["tipo2", "TIPO2"],
];

for (const [text, label] of NORMALIZED_TEXTS) {
  test(`"${text}" becomes ${label} on an edge and on an entity`, () => {
    assert.equal(toEdgeLabel(text), label);
    assert.equal(toEntityLabel(text), label);
  });
}

test("different spellings of one relation type meet in one edge label", () => {
  assert.equal(toEdgeLabel("resolves-to"), toEdgeLabel("Resolves To"));
});

test("an edge with no type, or a type that cannot make a label, is RELATED", () => {
  assert.equal(toEdgeLabel(undefined), "RELATED");
  assert.equal(toEdgeLabel(""), "RELATED");
  assert.equal(toEdgeLabel("   "), "RELATED");
  assert.equal(toEdgeLabel("!!!"), "RELATED");
  assert.equal(toEdgeLabel("3rd_party"), "RELATED");
});

test("an entity type that cannot make a label gets none", () => {
  assert.equal(toEntityLabel(""), null);
  assert.equal(toEntityLabel("---"), null);
  assert.equal(toEntityLabel("3DES"), null);
});

test("an entity type that clashes with a label the adapter uses gets none", () => {
  assert.equal(toEntityLabel("Entity"), null);
  assert.equal(toEntityLabel("attribute"), null);
  assert.equal(toEntityLabel("ENTITY"), null);
});

test("an edge may be called like a reserved node label: they are different namespaces", () => {
  assert.equal(toEdgeLabel("entity"), "ENTITY");
});

test("a text trying to break out of the query never reaches it", () => {
  const hostile = "X) DETACH DELETE n //";

  assert.equal(toEdgeLabel(hostile), "X_DETACH_DELETE_N");
  assert.match(toEntityLabel(hostile) as string, /^[A-Z][A-Z0-9_]*$/);
});
