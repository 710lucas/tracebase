import { test } from "node:test";
import assert from "node:assert/strict";
import { createSnippet, indexOfText } from "../../../../src/core/ports/graph-repository/index.ts";

test("finds the text ignoring case, and says where it starts", () => {
  assert.equal(indexOfText("Example.COM", "ample"), 2);
  assert.equal(indexOfText("Example.COM", "com"), 8);
  assert.equal(indexOfText("Example.COM", "xyz"), -1);
});

test("takes the text literally: a dot is a dot and not any character", () => {
  assert.equal(indexOfText("abc", "a.c"), -1);
  assert.equal(indexOfText("a.c", "a.c"), 0);
  assert.equal(indexOfText("price (usd) [10]", "(usd) [10]"), 6);
  assert.equal(indexOfText("a+b", "a+b"), 0);
});

test("ignores the case of letters with accents", () => {
  assert.equal(indexOfText("CAFÉ", "café"), 0);
});

test("insensitive (the default) also ignores accents, in both directions", () => {
  assert.equal(indexOfText("um CAFÉ bom", "cafe"), 3);
  assert.equal(indexOfText("um cafe bom", "CAFÉ"), 3);
  assert.equal(indexOfText("São Paulo", "sao"), 0);
  assert.equal(indexOfText("cafe", "café", "insensitive"), 0);
});

test("insensitive tells the position in the original value when folding changes its length", () => {
  // `İ` (one character) folds to `i` and `ﬁ`-like cases stay; the position must still be the original one.
  assert.equal(indexOfText("İstanbul", "stan"), 1);
});

test("contains respects case and accents", () => {
  assert.equal(indexOfText("um café bom", "café", "contains"), 3);
  assert.equal(indexOfText("um CAFÉ bom", "café", "contains"), -1);
  assert.equal(indexOfText("um cafe bom", "café", "contains"), -1);
});

test("exact finds the text only when the value is the text", () => {
  assert.equal(indexOfText("café", "café", "exact"), 0);
  assert.equal(indexOfText("um café", "café", "exact"), -1);
  assert.equal(indexOfText("Café", "café", "exact"), -1);
});

test("a snippet looks for the text in the same mode", () => {
  const value = `${"a".repeat(50)}CAFÉ${"b".repeat(50)}`;

  assert.equal(createSnippet(value, "cafe", 20), `…${"a".repeat(8)}CAFÉ${"b".repeat(8)}…`);
});

test("a value that fits is shown whole", () => {
  assert.equal(createSnippet("example.com", "ample", 200), "example.com");
});

test("a long value is cut around the text, with an ellipsis at each end that was cut", () => {
  const value = `${"a".repeat(50)}NEEDLE${"b".repeat(50)}`;

  const snippet = createSnippet(value, "needle", 20);

  assert.equal(snippet, `…${"a".repeat(7)}NEEDLE${"b".repeat(7)}…`);
  assert.equal(Array.from(snippet).length, 20 + 2);
});

test("a text at the start has no ellipsis before it", () => {
  const value = `NEEDLE${"b".repeat(100)}`;

  assert.equal(createSnippet(value, "needle", 20), `NEEDLE${"b".repeat(14)}…`);
});

test("a text at the end has no ellipsis after it", () => {
  const value = `${"a".repeat(100)}NEEDLE`;

  assert.equal(createSnippet(value, "needle", 20), `…${"a".repeat(14)}NEEDLE`);
});

test("a text longer than the snippet starts the snippet and is cut at the length", () => {
  const value = `xx${"n".repeat(50)}yy`;

  assert.equal(createSnippet(value, "n".repeat(40), 10), `…${"n".repeat(10)}…`);
});

test("characters made of two UTF-16 units are never split", () => {
  const value = `${"😀".repeat(30)}needle${"😀".repeat(30)}`;

  const snippet = createSnippet(value, "needle", 10);

  assert.equal(Array.from(snippet.replaceAll("…", "")).length, 10);
  assert.ok(!snippet.includes("�"));
  assert.ok(snippet.includes("needle"));
});

test("the length counts characters, not ellipses", () => {
  assert.equal(
    Array.from(createSnippet(`${"a".repeat(30)}x${"b".repeat(30)}`, "x", 5)).length,
    5 + 2,
  );
});
