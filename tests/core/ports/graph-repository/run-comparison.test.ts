import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntity } from "../../../../src/core/domain/entity/index.ts";
import { createRunComparison } from "../../../../src/core/ports/graph-repository/index.ts";

const A = { tool: "spiderfoot", run: "scan-1" };
const B = { tool: "spiderfoot", run: "scan-2" };

const ip = (value: string) => createEntity("IP_ADDRESS", value);
const host = (value: string) => createEntity("DOMAIN_NAME", value);

const valuesOf = (entities: readonly { value: string }[]) => entities.map(({ value }) => value);

test("splits the entities into the ones only the first saw, both saw and only the second saw", () => {
  const comparison = createRunComparison(
    A,
    B,
    [ip("1.1.1.1"), host("old.example.com"), host("both.example.com")],
    [host("both.example.com"), host("new.example.com"), ip("2.2.2.2")],
    50,
  );

  assert.deepEqual(valuesOf(comparison.onlyA.entities), ["1.1.1.1", "old.example.com"]);
  assert.deepEqual(valuesOf(comparison.both.entities), ["both.example.com"]);
  assert.deepEqual(valuesOf(comparison.onlyB.entities), ["2.2.2.2", "new.example.com"]);
  assert.deepEqual([comparison.a, comparison.b], [A, B]);
});

test("the same value with another type is another entity", () => {
  const comparison = createRunComparison(A, B, [ip("x")], [host("x")], 50);

  assert.equal(comparison.onlyA.total, 1);
  assert.equal(comparison.onlyB.total, 1);
  assert.equal(comparison.both.total, 0);
});

test("an entity listed twice in a run counts once", () => {
  const comparison = createRunComparison(A, B, [ip("1.1.1.1"), ip("1.1.1.1")], [], 50);

  assert.equal(comparison.onlyA.total, 1);
});

test("counts by type, the type with the most entities first and by name between equals", () => {
  const comparison = createRunComparison(
    A,
    B,
    [],
    [host("a"), host("b"), ip("1"), createEntity("ASN", "AS1")],
    50,
  );

  assert.deepEqual(comparison.onlyB.byType, [
    { type: "DOMAIN_NAME", count: 2 },
    { type: "ASN", count: 1 },
    { type: "IP_ADDRESS", count: 1 },
  ]);
});

test("lists the first `limit` ordered by value then type, and says when it cut", () => {
  const comparison = createRunComparison(A, B, [], [host("c"), ip("a"), host("b")], 2);

  assert.deepEqual(valuesOf(comparison.onlyB.entities), ["a", "b"]);
  assert.equal(comparison.onlyB.total, 3);
  assert.equal(comparison.onlyB.truncated, true);
  assert.equal(comparison.both.truncated, false);
});

test("two empty runs give empty groups", () => {
  const comparison = createRunComparison(A, B, [], [], 50);

  for (const group of [comparison.onlyA, comparison.both, comparison.onlyB]) {
    assert.deepEqual(group, { total: 0, byType: [], entities: [], truncated: false });
  }
});

test("does not change the lists it was given", () => {
  const given = [host("b"), host("a")];

  createRunComparison(A, B, given, [], 50);

  assert.deepEqual(valuesOf(given), ["b", "a"]);
});
