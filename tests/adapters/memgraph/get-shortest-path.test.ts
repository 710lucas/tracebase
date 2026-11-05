import { test } from "node:test";
import assert from "node:assert/strict";
import { getShortestPath } from "../../../src/adapters/memgraph/get-shortest-path.ts";
import type {
  MemgraphConnection,
  RunOptions,
} from "../../../src/adapters/memgraph/memgraph-connection.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";
import {
  DEFAULT_QUERY_TIMEOUT_MS,
  InvalidShortestPathOptionsError,
  QueryTimeoutError,
} from "../../../src/core/ports/graph-repository/index.ts";

// What is decided here (the order of the queries, the limit shared by them, what is skipped) can be checked
// without a database: the fake connection answers by the kind of query and records what it was asked.
type Answer = Record<string, unknown>[] | Error;

function fakeConnection(answers: {
  exist?: Answer;
  distances?: Answer;
  neighbours?: Answer;
  edges?: Answer;
}) {
  const calls: { query: string; options?: RunOptions }[] = [];
  const connection = {
    run: async (query: string, _parameters?: Record<string, unknown>, options?: RunOptions) => {
      calls.push({ query, ...(options !== undefined && { options }) });
      const kind = query.includes("IS NOT NULL")
        ? "exist"
        : query.includes("*BFS")
          ? "distances"
          : query.includes("UNWIND")
            ? "edges"
            : "neighbours";
      const answer = answers[kind] ?? [];
      if (answer instanceof Error) throw answer;
      return answer;
    },
  } as unknown as MemgraphConnection;

  return { connection, calls };
}

const from = createEntity("HOST", "a");
const to = createEntity("HOST", "a");
const both = [{ sourceExists: true, targetExists: true }];

test("is null when either entity has no node, and asks nothing more", async () => {
  for (const exist of [
    [{ sourceExists: false, targetExists: true }],
    [{ sourceExists: true, targetExists: false }],
  ]) {
    const { connection, calls } = fakeConnection({ exist });

    assert.equal(await getShortestPath(connection, from, createEntity("HOST", "b")), null);
    assert.equal(calls.length, 1);
  }
});

test("refuses a maxHops that makes no sense before asking anything", async () => {
  const { connection, calls } = fakeConnection({ exist: both });

  await assert.rejects(
    getShortestPath(connection, from, to, { maxHops: 0 }),
    InvalidShortestPathOptionsError,
  );
  assert.equal(calls.length, 0);
});

test("writes the maxHops of the request into the search from the target", async () => {
  const { connection, calls } = fakeConnection({ exist: both });

  await getShortestPath(connection, from, to, { maxHops: 4 });
  await getShortestPath(connection, from, to);

  const searches = calls.filter(({ query }) => query.includes("*BFS")).map(({ query }) => query);
  assert.match(searches[0] ?? "", /\*BFS \.\.4\]/);
  assert.match(searches[1] ?? "", /\*BFS \.\.6\]/);
});

test("a path from an entity to itself asks for no neighbours and no edges", async () => {
  const { connection, calls } = fakeConnection({
    exist: both,
    distances: [{ type: null, value: null }],
  });

  const path = await getShortestPath(connection, from, to);

  assert.deepEqual(path?.entities, [from]);
  assert.deepEqual(path?.steps, []);
  assert.equal(calls.length, 2);
});

test("an entity that is not within the hops of the target gives an empty path", async () => {
  const other = createEntity("HOST", "far");
  const { connection, calls } = fakeConnection({
    exist: both,
    distances: [{ type: "HOST", value: "near", distance: 1 }],
  });

  const path = await getShortestPath(connection, other, to);

  assert.deepEqual(path?.entities, []);
  assert.deepEqual(path?.steps, []);
  assert.equal(calls.length, 2);
});

test("every query is given what is left of the default time limit", async () => {
  const { connection, calls } = fakeConnection({
    exist: both,
    distances: [{ type: null, value: null }],
  });

  await getShortestPath(connection, from, to);

  for (const { options } of calls) {
    assert.ok((options?.timeoutMs ?? 0) > DEFAULT_QUERY_TIMEOUT_MS - 1000);
    assert.ok((options?.timeoutMs ?? Infinity) <= DEFAULT_QUERY_TIMEOUT_MS);
  }
});

test("a timeout in any query names the whole limit, not what was left", async () => {
  const { connection } = fakeConnection({ exist: both, distances: new QueryTimeoutError(7) });

  await assert.rejects(
    getShortestPath(connection, from, to, { timeoutMs: 5000 }),
    (error: unknown) => error instanceof QueryTimeoutError && error.timeoutMs === 5000,
  );
});

test("fails with a timeout, asking nothing, when the limit is already used up", async () => {
  const { connection, calls } = fakeConnection({ exist: both });

  await assert.rejects(getShortestPath(connection, from, to, { timeoutMs: 0 }), QueryTimeoutError);
  assert.equal(calls.length, 0);
});

test("lets an error that is not a timeout reach the caller", async () => {
  const { connection } = fakeConnection({ exist: new Error("connection lost") });

  await assert.rejects(getShortestPath(connection, from, to), /connection lost/);
});
