import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidEntityError } from "../../../../src/core/domain/entity/index.ts";

test("carries a recognizable name and the reason", () => {
  const error = new InvalidEntityError("value must not be blank");
  assert.equal(error.name, "InvalidEntityError");
  assert.equal(error.message, "Invalid entity: value must not be blank");
  assert.ok(error instanceof Error);
});
