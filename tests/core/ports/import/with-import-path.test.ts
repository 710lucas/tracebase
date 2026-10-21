import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntity } from "../../../../src/core/domain/entity/index.ts";
import { InvalidImportBatchError } from "../../../../src/core/ports/import/index.ts";
import { withImportPath } from "../../../../src/core/ports/import/with-import-path.ts";

test("returns whatever the builder returns", () => {
  assert.equal(withImportPath("p", () => createEntity("T", "v")).value, "v");
});

test("turns a domain rejection into an import error with the given path", () => {
  assert.throws(
    () => withImportPath("relations[0].source", () => createEntity(" ", "v")),
    (error: unknown) =>
      error instanceof InvalidImportBatchError && error.path === "relations[0].source",
  );
});

test("lets errors that are not domain rejections through, because they are bugs", () => {
  assert.throws(
    () =>
      withImportPath("p", () => {
        throw new TypeError("boom");
      }),
    TypeError,
  );
});
