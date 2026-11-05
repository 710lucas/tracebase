import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../../../src/adapters/http/index.ts";
import { createInMemoryGraphRepository } from "../../../../src/adapters/memory/in-memory-graph-repository.ts";
import {
  QueryTimeoutError,
  type GraphRepository,
  type QueryOptions,
} from "../../../../src/core/ports/graph-repository/index.ts";

// `GET /graph/entities/degree`: the real app over the in-memory repository for the answers the graph
// gives, and over a repository that sees every call and can run out of time for the ones it cannot give.
const calls: (QueryOptions | undefined)[] = [];
let timesOut = false;
let runningServer: Server;
let baseUrl: string;

before(async () => {
  const silencedLog = mock.method(console, "log", () => {});
  const memory = createInMemoryGraphRepository();
  const graphRepository: GraphRepository = {
    ...memory,
    getEntityDegree: async (entity, options) => {
      calls.push(options);
      if (timesOut) throw new QueryTimeoutError(options?.timeoutMs ?? 30_000);
      return memory.getEntityDegree(entity, options);
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
          source: { type: "DOMAIN_NAME", value: "example.com" },
          target: { type: "IP_ADDRESS", value: "93.184.216.34" },
          type: "resolves_to",
        },
        {
          source: { type: "DOMAIN_NAME", value: "example.com" },
          target: { type: "EMAILADDR", value: "admin@example.com" },
        },
      ],
      attributes: [],
    }),
  });
  silencedLog.mock.restore();
});

after(async () => {
  await new Promise((resolve) => runningServer.close(resolve));
});

function getDegree(query: string) {
  return fetch(`${baseUrl}/graph/entities/degree?${query}`);
}

const DOMAIN = "type=DOMAIN_NAME&value=example.com";

test("answers 200 with the degree of the entity", async () => {
  const response = await getDegree(DOMAIN);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    entity: { type: "DOMAIN_NAME", value: "example.com" },
    total: 2,
    incoming: 0,
    outgoing: 2,
    byNeighbourType: [
      { type: "EMAILADDR", count: 1 },
      { type: "IP_ADDRESS", count: 1 },
    ],
  });
});

test("passes no time limit on when the request gives none, so the default applies", async () => {
  calls.length = 0;
  await getDegree(DOMAIN);

  assert.deepEqual(calls, [{}]);
});

test("passes the time limit of the request on", async () => {
  calls.length = 0;
  await getDegree(`${DOMAIN}&timeoutMs=1500`);

  assert.deepEqual(calls, [{ timeoutMs: 1500 }]);
});

test("answers 404 when nothing in the graph mentions the entity", async () => {
  const response = await getDegree("type=DOMAIN_NAME&value=nobody.example");

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "entity not found" });
});

test("answers 400 when type or value is missing", async () => {
  const response = await getDegree("type=DOMAIN_NAME");

  assert.equal(response.status, 400);
});

test("answers 400 with the domain's reason when the value is blank", async () => {
  const response = await getDegree("type=DOMAIN_NAME&value=%20");

  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /value must not be blank/);
});

for (const timeoutMs of ["0", "-5", "1.5", "abc", "99999999999999999999"]) {
  test(`answers 400 for a time limit of "${timeoutMs}"`, async () => {
    const response = await getDegree(`${DOMAIN}&timeoutMs=${timeoutMs}`);

    assert.equal(response.status, 400);
    assert.match(((await response.json()) as { error: string }).error, /timeoutMs/);
  });
}

test("answers 400 when the time limit is given twice", async () => {
  const response = await getDegree(`${DOMAIN}&timeoutMs=100&timeoutMs=200`);

  assert.equal(response.status, 400);
});

test("answers 504 with the limit used when the read runs out of time", async () => {
  timesOut = true;
  try {
    const response = await getDegree(`${DOMAIN}&timeoutMs=250`);

    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), {
      error: "Query exceeded 0.25 s; reduce depth, limit or filter",
      timeoutMs: 250,
    });
  } finally {
    timesOut = false;
  }
});
