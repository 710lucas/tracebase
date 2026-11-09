import { test } from "node:test";
import assert from "node:assert/strict";
import { foldLetter, foldText } from "../../../../src/core/domain/text/index.ts";

test("a letter folds to the lower case letter without its accent", () => {
  assert.equal(foldLetter("É"), "e");
  assert.equal(foldLetter("é"), "e");
  assert.equal(foldLetter("ç"), "c");
  assert.equal(foldLetter("Ã"), "a");
});

test("a letter without accent is only lowered, and what is not a letter stays", () => {
  assert.equal(foldLetter("Q"), "q");
  assert.equal(foldLetter("."), ".");
  assert.equal(foldLetter("ß"), "ß");
});

test("a text folds letter by letter", () => {
  assert.equal(foldText("São PAULO").folded, "sao paulo");
});

test("each unit of the folded text says where it came from in the original", () => {
  assert.deepEqual(foldText("aÉb").origins, [0, 1, 2]);
  // `😀` takes two UTF-16 units, so the letter after it is at position 2.
  assert.deepEqual(foldText("😀Éx").origins, [0, 0, 2, 3]);
});
