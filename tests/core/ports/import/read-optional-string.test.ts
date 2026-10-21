import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidImportBatchError } from "../../../../src/core/ports/import/index.ts";
import { readOptionalString } from "../../../../src/core/ports/import/read-optional-string.ts";

test("returns undefined when absent and the string when present", () => {
  assert.equal(readOptionalString({}, "k", "p"), undefined);
  assert.equal(readOptionalString({ k: "v" }, "k", "p"), "v");
});

test("rejects a present value that is not a string", () => {
  assert.throws(() => readOptionalString({ k: 1 }, "k", "p"), InvalidImportBatchError);
  assert.throws(() => readOptionalString({ k: null }, "k", "p"), InvalidImportBatchError);
});
