import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool, toolAnswer, toolError } from "../../../src/adapters/mcp/tool-result.ts";
import { InvalidEntityError } from "../../../src/core/domain/entity/index.ts";
import {
  InvalidEntityQueryError,
  InvalidNeighbourhoodOptionsError,
  InvalidSearchError,
  InvalidShortestPathOptionsError,
  QueryTimeoutError,
} from "../../../src/core/ports/graph-repository/index.ts";

test("an answer is compact JSON in one text content", () => {
  assert.deepEqual(toolAnswer({ a: 1, b: [2] }), {
    content: [{ type: "text", text: '{"a":1,"b":[2]}' }],
  });
});

test("an error is marked as such and carries the message as text", () => {
  assert.deepEqual(toolError("went wrong"), {
    isError: true,
    content: [{ type: "text", text: "went wrong" }],
  });
});

test("what the tool answers goes through untouched", async () => {
  assert.deepEqual(await runTool(async () => toolAnswer("ok")), toolAnswer("ok"));
});

for (const error of [
  new InvalidEntityError("type must not be blank"),
  new InvalidNeighbourhoodOptionsError("hops must be a whole number from 1"),
  new InvalidShortestPathOptionsError("maxHops must be a whole number from 1"),
  new InvalidSearchError("the text must have at least one character"),
  new InvalidEntityQueryError("limit must be a whole number from 1"),
]) {
  test(`${error.name} becomes a tool error with its own message`, async () => {
    const result = await runTool(async () => {
      throw error;
    });

    assert.deepEqual(result, toolError(error.message));
  });
}

test("a read that ran out of time becomes a tool error that tells the limit", async () => {
  const result = await runTool(async () => {
    throw new QueryTimeoutError(5000);
  });

  assert.equal(result.isError, true);
  assert.match(
    (result.content[0] as { text: string }).text,
    /the limit was 5000 ms; pass a bigger timeoutMs or ask for less/,
  );
});

test("an error that is ours is not hidden: it goes on", async () => {
  await assert.rejects(
    runTool(async () => {
      throw new Error("the database is gone");
    }),
    /the database is gone/,
  );
});
