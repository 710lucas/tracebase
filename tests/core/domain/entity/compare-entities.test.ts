import { test } from "node:test";
import assert from "node:assert/strict";
import { compareEntities, createEntity } from "../../../../src/core/domain/entity/index.ts";

test("orders by type first, then by value", () => {
  const sorted = [createEntity("B", "a"), createEntity("A", "z"), createEntity("A", "b")].sort(
    compareEntities,
  );

  assert.deepEqual(
    sorted.map(({ type, value }) => `${type}:${value}`),
    ["A:b", "A:z", "B:a"],
  );
});

test("compares character by character, so capitals come before lower case", () => {
  assert.ok(compareEntities(createEntity("T", "Z"), createEntity("T", "a")) < 0);
});

test("equal entities are not ordered", () => {
  assert.equal(compareEntities(createEntity("T", "a"), createEntity("T", "a")), 0);
});
