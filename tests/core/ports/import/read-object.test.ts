import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidImportBatchError } from "../../../../src/core/ports/import/index.ts";
import { readObject } from "../../../../src/core/ports/import/read-object.ts";

test("returns the object when all keys are allowed", () => {
  assert.deepEqual(readObject({ a: 1 }, "p", ["a", "b"]), { a: 1 });
});

test("rejects anything that is not a plain object", () => {
  for (const bad of [null, undefined, "x", 3, [], true]) {
    assert.throws(() => readObject(bad, "p", ["a"]), InvalidImportBatchError);
  }
});

test("rejects an unknown key and names it, so a typo is not silently dropped", () => {
  assert.throws(
    () => readObject({ confidance: 5 }, "p", ["confidence"]),
    (error: unknown) =>
      error instanceof InvalidImportBatchError &&
      error.path === "p" &&
      /confidance/.test(error.message),
  );
});
