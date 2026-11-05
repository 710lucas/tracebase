import { test } from "node:test";
import assert from "node:assert/strict";
import { QueryTimeoutError } from "../../../../src/core/ports/graph-repository/index.ts";

test("carries a recognizable name, the limit and a message that says what to do", () => {
  const error = new QueryTimeoutError(30_000);

  assert.equal(error.name, "QueryTimeoutError");
  assert.equal(error.timeoutMs, 30_000);
  assert.equal(error.message, "Query exceeded 30 s; reduce depth, limit or filter");
  assert.ok(error instanceof Error);
});

test("writes a limit below one second as a fraction of a second", () => {
  assert.equal(
    new QueryTimeoutError(300).message,
    "Query exceeded 0.3 s; reduce depth, limit or filter",
  );
});
