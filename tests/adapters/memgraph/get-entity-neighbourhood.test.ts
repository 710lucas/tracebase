import { test } from "node:test";
import assert from "node:assert/strict";
import { getEntityNeighbourhood } from "../../../src/adapters/memgraph/get-entity-neighbourhood.ts";
import type {
  MemgraphConnection,
  RunOptions,
} from "../../../src/adapters/memgraph/memgraph-connection.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";
import {
  DEFAULT_QUERY_TIMEOUT_MS,
  InvalidNeighbourhoodOptionsError,
  QueryTimeoutError,
} from "../../../src/core/ports/graph-repository/index.ts";

// The time limit is shared by the three queries and decided here, so a fake connection is enough to
// check it without a database: it records what `run` was given and answers what `answer` says.
function fakeConnection(answer: (call: number) => Record<string, unknown>[] | Error) {
  const calls: { query: string; options?: RunOptions }[] = [];
  const connection = {
    run: async (query: string, _parameters?: Record<string, unknown>, options?: RunOptions) => {
      calls.push({ query, ...(options !== undefined && { options }) });
      const result = answer(calls.length);
      if (result instanceof Error) throw result;
      return result;
    },
  } as unknown as MemgraphConnection;

  return { connection, calls };
}

const origin = createEntity("HOST", "origin");
const alone = [{ type: null, value: null, distance: 0 }];

test("asks each query for what is left of the default time limit", async () => {
  const { connection, calls } = fakeConnection((call) => (call === 1 ? alone : []));

  await getEntityNeighbourhood(connection, origin);

  assert.equal(calls.length, 3);
  for (const { options } of calls) {
    assert.ok((options?.timeoutMs ?? 0) > DEFAULT_QUERY_TIMEOUT_MS - 1000);
    assert.ok((options?.timeoutMs ?? Infinity) <= DEFAULT_QUERY_TIMEOUT_MS);
  }
  const limits = calls.map(({ options }) => options?.timeoutMs ?? 0);
  assert.deepEqual(
    [...limits].sort((a, b) => b - a),
    limits,
  );
});

test("is null when the origin has no row, and asks nothing more", async () => {
  const { connection, calls } = fakeConnection(() => []);

  assert.equal(await getEntityNeighbourhood(connection, origin), null);
  assert.equal(calls.length, 1);
});

test("an origin with nothing near it is alone", async () => {
  const { connection } = fakeConnection((call) => (call === 1 ? alone : []));

  const neighbourhood = await getEntityNeighbourhood(connection, origin);

  assert.deepEqual(neighbourhood?.entities, [{ entity: origin, distance: 0, attributes: [] }]);
  assert.equal(neighbourhood?.truncated, false);
});

test("a timeout in any query names the whole limit, not what was left", async () => {
  const { connection } = fakeConnection((call) => (call === 1 ? alone : new QueryTimeoutError(7)));

  await assert.rejects(
    getEntityNeighbourhood(connection, origin, { timeoutMs: 5000 }),
    (error: unknown) => error instanceof QueryTimeoutError && error.timeoutMs === 5000,
  );
});

test("fails with a timeout, without asking, when the limit is already used up", async () => {
  const { connection, calls } = fakeConnection(() => []);

  await assert.rejects(
    getEntityNeighbourhood(connection, origin, { timeoutMs: 0 }),
    (error: unknown) => error instanceof QueryTimeoutError && error.timeoutMs === 0,
  );
  assert.equal(calls.length, 0);
});

test("lets an error that is not a timeout reach the caller", async () => {
  const { connection } = fakeConnection(() => new Error("connection lost"));

  await assert.rejects(getEntityNeighbourhood(connection, origin), /connection lost/);
});

test("refuses hops and maxEntities that make no sense before asking anything", async () => {
  const { connection, calls } = fakeConnection(() => []);

  await assert.rejects(
    getEntityNeighbourhood(connection, origin, { hops: 0 }),
    InvalidNeighbourhoodOptionsError,
  );
  assert.equal(calls.length, 0);
});
