import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidRelationError } from "../../../../src/core/domain/relation/index.ts";

test("carries a recognizable name and the reason", () => {
  const error = new InvalidRelationError("type must not be blank when present");
  assert.equal(error.name, "InvalidRelationError");
  assert.equal(error.message, "Invalid relation: type must not be blank when present");
  assert.ok(error instanceof Error);
});
