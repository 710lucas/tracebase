import { test } from "node:test";
import assert from "node:assert/strict";
import { caseVariants, MAX_VARIED_LETTERS } from "../../../src/adapters/memgraph/case-variants.ts";

// The variants are what `toLower(value) CONTAINS variant` is asked with, and Memgraph's `toLower` only lowers the
// letters of the ASCII alphabet, so the ASCII letters of every variant are lower case.

test("a text with no letter outside the ASCII alphabet has one variant, in lower case", () => {
  assert.deepEqual(caseVariants("Example.COM-123"), ["example.com-123"]);
});

test("a letter with an accent is tried in both cases, whatever case it was written in", () => {
  assert.deepEqual([...caseVariants("café")].sort(), ["cafÉ", "café"]);
  assert.deepEqual([...caseVariants("CAFÉ")].sort(), ["cafÉ", "café"]);
});

test("each different accented letter doubles the variants", () => {
  assert.deepEqual([...caseVariants("Ação")].sort(), ["aÇÃo", "aÇão", "açÃo", "ação"].sort());
});

test("the same letter is varied by kind, not by place", () => {
  assert.deepEqual([...caseVariants("ãã")].sort(), ["ÃÃ", "ãã"]);
});

test("characters that have no case are left as they are", () => {
  assert.deepEqual(caseVariants("日本-1"), ["日本-1"]);
});

test("past the limit of different letters only all lower case and all upper case are tried", () => {
  const text = "áéíóúãõ-Ab";
  assert.ok(
    new Set(Array.from(text).filter((c) => c.charCodeAt(0) > 127)).size > MAX_VARIED_LETTERS,
  );

  assert.deepEqual(caseVariants(text), ["áéíóúãõ-ab", "ÁÉÍÓÚÃÕ-ab"]);
});

test("at the limit every combination is still tried", () => {
  assert.equal(caseVariants("áéíó").length, 2 ** MAX_VARIED_LETTERS);
});
