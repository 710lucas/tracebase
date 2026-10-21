import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText } from "../../../../src/core/domain/text/index.ts";

test("trims leading and trailing whitespace", () => {
  assert.equal(normalizeText("  DOMAIN_NAME \n"), "DOMAIN_NAME");
});

test("composes Unicode to NFC", () => {
  const composed = "café";
  const decomposed = "café";
  assert.notEqual(composed, decomposed);
  assert.equal(normalizeText(decomposed), composed);
});

test("does not change case or inner characters", () => {
  assert.equal(normalizeText("Example.COM."), "Example.COM.");
  assert.equal(normalizeText("a  b"), "a  b");
});

test("returns an empty string for blank text", () => {
  assert.equal(normalizeText("   "), "");
});
