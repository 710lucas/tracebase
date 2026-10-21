import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEntityValue } from "../../../../src/core/domain/entity/normalize-entity-value.ts";

test("trims leading and trailing whitespace", () => {
  assert.equal(normalizeEntityValue("  example.com \n"), "example.com");
});

test("composes Unicode to NFC", () => {
  const composed = "café";
  const decomposed = "café";
  assert.notEqual(composed, decomposed);
  assert.equal(normalizeEntityValue(decomposed), composed);
});

// These two document what is intentionally left to the adapter, so nobody "fixes" it here.
test("does not change case", () => {
  assert.equal(normalizeEntityValue("Example.COM"), "Example.COM");
});

test("does not strip a trailing dot", () => {
  assert.equal(normalizeEntityValue("example.com."), "example.com.");
});
