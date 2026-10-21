import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidImportBatchError } from "../../../../src/core/ports/import/index.ts";
import { readOptionalStringList } from "../../../../src/core/ports/import/read-optional-string-list.ts";

test("returns undefined when absent and the list when present", () => {
  assert.equal(readOptionalStringList({}, "k", "p"), undefined);
  assert.deepEqual(readOptionalStringList({ k: ["a", "b"] }, "k", "p"), ["a", "b"]);
});

test("rejects a non-string entry and points at its position", () => {
  assert.throws(
    () => readOptionalStringList({ k: ["a", 2] }, "k", "p"),
    (error: unknown) => error instanceof InvalidImportBatchError && error.path === "p.k[1]",
  );
});
