import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidAttributeError } from "../../../../src/core/domain/attribute/index.ts";

test("carries a recognizable name and the reason", () => {
  const error = new InvalidAttributeError("name must not be blank");
  assert.equal(error.name, "InvalidAttributeError");
  assert.equal(error.message, "Invalid attribute: name must not be blank");
  assert.ok(error instanceof Error);
});
