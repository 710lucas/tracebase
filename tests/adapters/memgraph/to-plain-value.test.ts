import { test } from "node:test";
import assert from "node:assert/strict";
import neo4j from "neo4j-driver";
import { toPlainValue } from "../../../src/adapters/memgraph/to-plain-value.ts";

const node = (id: number, label: string, properties: Record<string, unknown>) =>
  new neo4j.types.Node(neo4j.int(id), [label], properties, String(id));
const relation = (id: number, from: number, to: number, type: string) =>
  new neo4j.types.Relationship(neo4j.int(id), neo4j.int(from), neo4j.int(to), type, { n: 1 });

test("keeps numbers, texts, booleans and null", () => {
  assert.deepEqual(toPlainValue([1, "a", true, null]), [1, "a", true, null]);
});

test("turns a node into its labels and properties, without the internal id", () => {
  assert.deepEqual(
    toPlainValue(node(1, "Entity", { type: "T", attributes: { a: { b: ["x"] } } })),
    {
      labels: ["Entity"],
      properties: { type: "T", attributes: { a: { b: ["x"] } } },
    },
  );
});

test("turns a relation into its type and properties", () => {
  assert.deepEqual(toPlainValue(relation(1, 1, 2, "LINKS")), {
    type: "LINKS",
    properties: { n: 1 },
  });
});

test("turns a path into its nodes and relations in order", () => {
  const [first, second, third] = [node(1, "A", {}), node(2, "B", {}), node(3, "C", {})];
  const path = new neo4j.types.Path(first, third, [
    new neo4j.types.PathSegment(first, relation(1, 1, 2, "X"), second),
    new neo4j.types.PathSegment(second, relation(2, 2, 3, "Y"), third),
  ]);

  assert.deepEqual(toPlainValue(path), {
    nodes: [
      { labels: ["A"], properties: {} },
      { labels: ["B"], properties: {} },
      { labels: ["C"], properties: {} },
    ],
    relationships: [
      { type: "X", properties: { n: 1 } },
      { type: "Y", properties: { n: 1 } },
    ],
  });
});

test("converts what is inside lists and maps", () => {
  assert.deepEqual(
    toPlainValue({ list: [node(1, "A", { x: 1 })], map: { r: relation(1, 1, 2, "X") } }),
    {
      list: [{ labels: ["A"], properties: { x: 1 } }],
      map: { r: { type: "X", properties: { n: 1 } } },
    },
  );
});

test("turns a date into its text", () => {
  assert.equal(toPlainValue(new neo4j.types.Date(2026, 11, 9)), "2026-11-09");
});
