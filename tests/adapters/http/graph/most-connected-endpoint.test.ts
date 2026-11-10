import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../../../src/adapters/http/index.ts";
import { createInMemoryGraphRepository } from "../../../../src/adapters/memory/in-memory-graph-repository.ts";
import {
  QueryTimeoutError,
  type GraphRepository,
  type MostConnectedOptions,
  type QueryOptions,
} from "../../../../src/core/ports/graph-repository/index.ts";

// `GET /graph/most-connected`: the real app over the in-memory repository, which answers the question, and over
// a repository that sees every call and can run out of time.
const calls: (QueryOptions & MostConnectedOptions)[] = [];
let timesOut = false;
let runningServer: Server;
let baseUrl: string;

before(async () => {
  const silencedLog = mock.method(console, "log", () => {});
  const memory = createInMemoryGraphRepository();
  const graphRepository: GraphRepository = {
    ...memory,
    getMostConnectedEntities: async (options) => {
      calls.push(options ?? {});
      if (timesOut) throw new QueryTimeoutError(options?.timeoutMs ?? 30_000);
      return memory.getMostConnectedEntities(options);
    },
  };
  await new Promise<void>((resolve) => {
    runningServer = createApp({ graphRepository, runtimeInfo: { storage: "memory" } }).listen(
      0,
      () => resolve(),
    );
  });
  baseUrl = `http://localhost:${(runningServer.address() as AddressInfo).port}`;

  await fetch(`${baseUrl}/imports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: { tool: "spiderfoot", run: "scan-1" },
      relations: [
        {
          source: { type: "DOMAIN_NAME", value: "a.example.com" },
          target: { type: "IP_ADDRESS", value: "10.0.0.1" },
        },
        {
          source: { type: "DOMAIN_NAME", value: "b.example.com" },
          target: { type: "IP_ADDRESS", value: "10.0.0.1" },
        },
      ],
    }),
  });
  silencedLog.mock.restore();
});

after(async () => {
  await new Promise<void>((resolve) => runningServer.close(() => resolve()));
});

test("answers the entities with the most relations, the most connected first", async () => {
  const response = await fetch(`${baseUrl}/graph/most-connected`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    entities: [
      { entity: { type: "IP_ADDRESS", value: "10.0.0.1" }, total: 2, incoming: 2, outgoing: 0 },
      {
        entity: { type: "DOMAIN_NAME", value: "a.example.com" },
        total: 1,
        incoming: 0,
        outgoing: 1,
      },
      {
        entity: { type: "DOMAIN_NAME", value: "b.example.com" },
        total: 1,
        incoming: 0,
        outgoing: 1,
      },
    ],
  });
});

test("passes the limit and the time limit on", async () => {
  calls.length = 0;

  const response = await fetch(`${baseUrl}/graph/most-connected?limit=1&timeoutMs=900`);

  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { entities: unknown[] }).entities.length, 1);
  assert.deepEqual(calls, [{ limit: 1, timeoutMs: 900 }]);
});

test("answers 400 for a limit that is not a plain whole number", async () => {
  for (const query of ["limit=abc", "limit=-1", "limit=1.5", "limit=1&limit=2", "limit="]) {
    const response = await fetch(`${baseUrl}/graph/most-connected?${query}`);

    assert.equal(response.status, 400, query);
    assert.match(((await response.json()) as { error: string }).error, /limit/, query);
  }
});

test("answers 400 when the core refuses the limit", async () => {
  const response = await fetch(`${baseUrl}/graph/most-connected?limit=0`);

  assert.equal(response.status, 400);
  assert.match(
    ((await response.json()) as { error: string }).error,
    /limit must be a whole number/,
  );
});

test("answers 400 for a time limit that makes no sense", async () => {
  const response = await fetch(`${baseUrl}/graph/most-connected?timeoutMs=0`);

  assert.equal(response.status, 400);
});

test("answers 504 with the limit used when the read runs out of time", async () => {
  timesOut = true;
  try {
    const response = await fetch(`${baseUrl}/graph/most-connected?timeoutMs=700`);

    assert.equal(response.status, 504);
    assert.equal(((await response.json()) as { timeoutMs: number }).timeoutMs, 700);
  } finally {
    timesOut = false;
  }
});
