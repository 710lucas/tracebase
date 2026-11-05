import { test } from "node:test";
import assert from "node:assert/strict";
import { getEntityDegree } from "../../../src/adapters/memgraph/get-entity-degree.ts";
import type {
  MemgraphConnection,
  RunOptions,
} from "../../../src/adapters/memgraph/memgraph-connection.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";
import {
  DEFAULT_QUERY_TIMEOUT_MS,
  QueryTimeoutError,
} from "../../../src/core/ports/graph-repository/index.ts";

// The time limit is decided here, before the query is sent, so a fake connection is enough to check it
// without a database: it records what `run` was given and answers the rows it was built with.
function fakeConnection(rows: Record<string, unknown>[]) {
  const calls: { parameters?: Record<string, unknown>; options?: RunOptions }[] = [];
  const connection = {
    run: async (_query: string, parameters?: Record<string, unknown>, options?: RunOptions) => {
      calls.push({ parameters, options });
      return rows;
    },
  } as unknown as MemgraphConnection;

  return { connection, calls };
}

const host = createEntity("DOMAIN_NAME", "example.com");

test("asks for the default time limit when the caller gives none", async () => {
  const { connection, calls } = fakeConnection([]);

  await getEntityDegree(connection, host);

  assert.deepEqual(calls[0]?.options, { timeoutMs: DEFAULT_QUERY_TIMEOUT_MS });
});

test("asks for the time limit the caller gave", async () => {
  const { connection, calls } = fakeConnection([]);

  await getEntityDegree(connection, host, { timeoutMs: 1234 });

  assert.deepEqual(calls[0]?.options, { timeoutMs: 1234 });
});

test("answers null when the entity has no node", async () => {
  const { connection } = fakeConnection([]);

  assert.equal(await getEntityDegree(connection, host), null);
});

test("drops the empty group a direction without edges leaves behind", async () => {
  const { connection } = fakeConnection([
    {
      outgoing: [{ type: "IP_ADDRESS", count: 2 }],
      incoming: [{ type: null, count: 0 }],
    },
  ]);

  assert.deepEqual(await getEntityDegree(connection, host), {
    entity: host,
    total: 2,
    incoming: 0,
    outgoing: 2,
    byNeighbourType: [{ type: "IP_ADDRESS", count: 2 }],
  });
});

test("lets the time limit error reach the caller", async () => {
  const connection = {
    run: async () => {
      throw new QueryTimeoutError(1000);
    },
  } as unknown as MemgraphConnection;

  await assert.rejects(getEntityDegree(connection, host, { timeoutMs: 1000 }), QueryTimeoutError);
});
