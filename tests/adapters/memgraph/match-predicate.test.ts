import { test } from "node:test";
import assert from "node:assert/strict";
import { createMatchPredicate } from "../../../src/adapters/memgraph/match-predicate.ts";

// The pattern is a regular expression for Memgraph, but it is written in the dialect JavaScript shares for what
// is used here (classes of letters, `[\s\S]`), so it can be tried here against values.
function matches(text: string, value: string): boolean {
  const { parameters } = createMatchPredicate(text, "insensitive");
  return new RegExp(`^${parameters["pattern"]}$`, "u").test(value);
}

test("exact compares the whole value with the text", () => {
  const predicate = createMatchPredicate("café", "exact");

  assert.equal(predicate.condition("n.value"), "n.value = $text");
  assert.deepEqual(predicate.parameters, { text: "café" });
});

test("contains asks whether the value has the text inside", () => {
  const predicate = createMatchPredicate("café", "contains");

  assert.equal(predicate.condition("candidate"), "candidate CONTAINS $text");
  assert.deepEqual(predicate.parameters, { text: "café" });
});

test("insensitive asks the value against a pattern", () => {
  const predicate = createMatchPredicate("x", "insensitive");

  assert.equal(predicate.condition("n.value"), "n.value =~ $pattern");
  assert.deepEqual(Object.keys(predicate.parameters), ["pattern"]);
});

test("the pattern ignores case and accents in both directions", () => {
  assert.equal(matches("café", "um CAFÉ bom"), true);
  assert.equal(matches("café", "um cafe bom"), true);
  assert.equal(matches("CAFE", "um café bom"), true);
  assert.equal(matches("sao", "São Paulo"), true);
  assert.equal(matches("café", "um chá"), false);
});

test("the pattern takes the text literally", () => {
  assert.equal(matches("a.c", "a.c"), true);
  assert.equal(matches("a.c", "abc"), false);
  assert.equal(matches("a-b", "xa-by"), true);
  assert.equal(matches("a]b", "a]b"), true);
  assert.equal(matches("a^b", "a^b"), true);
  assert.equal(matches("a\\b", "a\\b"), true);
});

test("the pattern finds the text across line breaks", () => {
  assert.equal(matches("cafe", "first line\ncafé\nlast"), true);
});

test("letters of other alphabets ignore case", () => {
  assert.equal(matches("дом", "ДОМ"), true);
});
