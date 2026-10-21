import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldPath, itemPath, ROOT_PATH } from "../../../../src/core/ports/import/field-path.ts";

test("a field of the root has no prefix", () => {
  assert.equal(fieldPath(ROOT_PATH, "source"), "source");
});

test("nested fields and list items compose into one readable path", () => {
  const relation = itemPath(fieldPath(ROOT_PATH, "relations"), 2);
  assert.equal(relation, "relations[2]");
  assert.equal(fieldPath(fieldPath(relation, "source"), "type"), "relations[2].source.type");
});
