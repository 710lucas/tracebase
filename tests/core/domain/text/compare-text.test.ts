import { test } from "node:test";
import assert from "node:assert/strict";
import { compareText } from "../../../../src/core/domain/text/index.ts";

test("orders character by character, so capitals come before lower case", () => {
  assert.ok(compareText("Z", "a") < 0);
  assert.ok(compareText("a", "b") < 0);
  assert.ok(compareText("b", "a") > 0);
});

test("a shorter text that starts another comes first", () => {
  assert.ok(compareText("ab", "abc") < 0);
});

test("equal texts are not ordered", () => {
  assert.equal(compareText("same", "same"), 0);
});
