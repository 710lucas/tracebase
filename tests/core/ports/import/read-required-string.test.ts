import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidImportBatchError } from "../../../../src/core/ports/import/index.ts";
import { readRequiredString } from "../../../../src/core/ports/import/read-required-string.ts";

test("returns the string, untouched (content rules belong to the domain)", () => {
  assert.equal(readRequiredString({ k: "  " }, "k", "p"), "  ");
});

test("rejects a missing or non-string field and reports its path", () => {
  for (const record of [{}, { k: 1 }, { k: null }]) {
    assert.throws(
      () => readRequiredString(record, "k", "p"),
      (error: unknown) => error instanceof InvalidImportBatchError && error.path === "p.k",
    );
  }
});
