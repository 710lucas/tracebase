import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntity, entityKey } from "../../../../src/core/domain/entity/index.ts";

test("two entities have the same key exactly when type and value are equal", () => {
  assert.equal(entityKey(createEntity("HOST", "a")), entityKey(createEntity(" HOST ", "a ")));
  assert.notEqual(entityKey(createEntity("HOST", "a")), entityKey(createEntity("HOST", "b")));
  assert.notEqual(entityKey(createEntity("HOST", "a")), entityKey(createEntity("EMAIL", "a")));
});

test("the key tells apart a type and value that would join into the same text", () => {
  assert.notEqual(entityKey(createEntity("AB", "C")), entityKey(createEntity("A", "BC")));
});
