import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidProvenanceError } from "../../../../src/core/domain/provenance/index.ts";

test("carries a recognizable name and the reason", () => {
  const error = new InvalidProvenanceError("tool must not be blank");
  assert.equal(error.name, "InvalidProvenanceError");
  assert.equal(error.message, "Invalid provenance: tool must not be blank");
  assert.ok(error instanceof Error);
});
