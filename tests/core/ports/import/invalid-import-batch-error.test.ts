import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidImportBatchError } from "../../../../src/core/ports/import/index.ts";

test("carries a recognizable name, the path and the reason", () => {
  const error = new InvalidImportBatchError("relations[2].source", "must be an object");
  assert.equal(error.name, "InvalidImportBatchError");
  assert.equal(error.path, "relations[2].source");
  assert.match(error.message, /relations\[2\]\.source/);
  assert.match(error.message, /must be an object/);
});
