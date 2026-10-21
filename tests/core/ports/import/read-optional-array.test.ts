import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidImportBatchError } from "../../../../src/core/ports/import/index.ts";
import { readOptionalArray } from "../../../../src/core/ports/import/read-optional-array.ts";

test("returns undefined when absent and the array when present", () => {
  assert.equal(readOptionalArray({}, "k", "p"), undefined);
  assert.deepEqual(readOptionalArray({ k: [1, "a"] }, "k", "p"), [1, "a"]);
});

test("rejects a present value that is not an array", () => {
  assert.throws(() => readOptionalArray({ k: {} }, "k", "p"), InvalidImportBatchError);
});
