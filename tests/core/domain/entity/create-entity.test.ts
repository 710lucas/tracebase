import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntity, InvalidEntityError } from "../../../../src/core/domain/entity/index.ts";

test("creates an entity with the given type and value", () => {
  const entity = createEntity("DOMAIN_NAME", "example.com");
  assert.equal(entity.type, "DOMAIN_NAME");
  assert.equal(entity.value, "example.com");
});

test("rejects a blank type", () => {
  assert.throws(() => createEntity("  ", "example.com"), InvalidEntityError);
});

test("rejects a blank value", () => {
  assert.throws(() => createEntity("DOMAIN_NAME", ""), InvalidEntityError);
  assert.throws(() => createEntity("DOMAIN_NAME", "   "), InvalidEntityError);
});

test("the created entity cannot be mutated", () => {
  const entity = createEntity("DOMAIN_NAME", "example.com");
  assert.ok(Object.isFrozen(entity));
});

test("normalizes the value, so equivalent spellings are the same entity", () => {
  assert.deepEqual(createEntity("PERSON", "café "), createEntity("PERSON", "café"));
});

test("trims the type, so a stray space does not create a different type", () => {
  assert.deepEqual(
    createEntity(" DOMAIN_NAME ", "example.com"),
    createEntity("DOMAIN_NAME", "example.com"),
  );
});

test("accepts a type the core has never heard of", () => {
  const entity = createEntity("SOME_FUTURE_TOOL_TYPE", "x");
  assert.equal(entity.type, "SOME_FUTURE_TOOL_TYPE");
});
