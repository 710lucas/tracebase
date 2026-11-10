import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../../../src/adapters/http/index.ts";
import { createInMemoryGraphRepository } from "../../../../src/adapters/memory/in-memory-graph-repository.ts";
import {
  QueryTimeoutError,
  type GraphRepository,
} from "../../../../src/core/ports/graph-repository/index.ts";

// `GET /imports/compare`: the real app over the in-memory repository, with two runs imported, and over a repository
// that can run out of time.
let timesOut = false;
let runningServer: Server;
let baseUrl: string;

async function importRun(run: string, links: [string, string][]) {
  await fetch(`${baseUrl}/imports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: { tool: "spiderfoot", run },
      relations: links.map(([source, target]) => ({
        source: { type: "DOMAIN_NAME", value: source },
        target: { type: "IP_ADDRESS", value: target },
      })),
    }),
  });
}

before(async () => {
  const silencedLog = mock.method(console, "log", () => {});
  const memory = createInMemoryGraphRepository();
  const graphRepository: GraphRepository = {
    ...memory,
    queryEntities: async (query, options) => {
      if (timesOut) throw new QueryTimeoutError(options?.timeoutMs ?? 30_000);
      return memory.queryEntities(query, options);
    },
  };
  await new Promise<void>((resolve) => {
    runningServer = createApp({ graphRepository, runtimeInfo: { storage: "memory" } }).listen(
      0,
      () => resolve(),
    );
  });
  baseUrl = `http://localhost:${(runningServer.address() as AddressInfo).port}`;

  // scan-1 saw old.example.com and shared.example.com; scan-2 saw shared.example.com and new.example.com; the
  // address 10.0.0.1 is in both.
  await importRun("scan-1", [
    ["old.example.com", "10.0.0.1"],
    ["shared.example.com", "10.0.0.1"],
  ]);
  await importRun("scan-2", [
    ["shared.example.com", "10.0.0.1"],
    ["new.example.com", "10.0.0.1"],
  ]);
  silencedLog.mock.restore();
});

after(async () => {
  await new Promise<void>((resolve) => runningServer.close(() => resolve()));
});

const compare = (query: string) => fetch(`${baseUrl}/imports/compare?${query}`);
const RUNS = "aTool=spiderfoot&aRun=scan-1&bTool=spiderfoot&bRun=scan-2";

interface Group {
  total: number;
  entities: { type: string; value: string }[];
  truncated: boolean;
  byType: { type: string; count: number }[];
}

test("tells what only the first run saw, what both saw and what only the second saw", async () => {
  const response = await compare(RUNS);
  const body = (await response.json()) as { onlyA: Group; both: Group; onlyB: Group };

  assert.equal(response.status, 200);
  assert.deepEqual(
    body.onlyA.entities.map(({ value }) => value),
    ["old.example.com"],
  );
  assert.deepEqual(
    body.both.entities.map(({ value }) => value),
    ["10.0.0.1", "shared.example.com"],
  );
  assert.deepEqual(
    body.onlyB.entities.map(({ value }) => value),
    ["new.example.com"],
  );
  assert.deepEqual(body.both.byType, [
    { type: "DOMAIN_NAME", count: 1 },
    { type: "IP_ADDRESS", count: 1 },
  ]);
});

test("names the two runs in the answer", async () => {
  const body = (await (await compare(RUNS)).json()) as { a: unknown; b: unknown };

  assert.deepEqual(body.a, { tool: "spiderfoot", run: "scan-1" });
  assert.deepEqual(body.b, { tool: "spiderfoot", run: "scan-2" });
});

test("the limit cuts the lists and says so", async () => {
  const body = (await (await compare(`${RUNS}&limit=1`)).json()) as { both: Group };

  assert.equal(body.both.total, 2);
  assert.equal(body.both.entities.length, 1);
  assert.equal(body.both.truncated, true);
});

test("comparing a run with itself finds everything in both", async () => {
  const body = (await (
    await compare("aTool=spiderfoot&aRun=scan-1&bTool=spiderfoot&bRun=scan-1")
  ).json()) as { onlyA: Group; both: Group; onlyB: Group };

  assert.equal(body.onlyA.total, 0);
  assert.equal(body.onlyB.total, 0);
  assert.equal(body.both.total, 3);
});

test("answers 404 when a run is not in the graph", async () => {
  const response = await compare("aTool=spiderfoot&aRun=scan-1&bTool=spiderfoot&bRun=nobody");

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "run not found" });
});

test("answers 400 when a run is missing, blank or repeated", async () => {
  for (const query of [
    "aTool=spiderfoot&aRun=scan-1&bTool=spiderfoot",
    "aTool=spiderfoot&aRun=%20&bTool=spiderfoot&bRun=scan-2",
    "aTool=spiderfoot&aTool=nmap&aRun=scan-1&bTool=spiderfoot&bRun=scan-2",
    "",
  ]) {
    const response = await compare(query);

    assert.equal(response.status, 400, query);
    assert.match(((await response.json()) as { error: string }).error, /required/, query);
  }
});

test("answers 400 for a limit that is not a whole number from 1", async () => {
  for (const limit of ["0", "-1", "abc", "1.5", "1&limit=2"]) {
    const response = await compare(`${RUNS}&limit=${limit}`);

    assert.equal(response.status, 400, limit);
    assert.match(((await response.json()) as { error: string }).error, /limit/, limit);
  }
});

test("answers 400 for a time limit that makes no sense", async () => {
  assert.equal((await compare(`${RUNS}&timeoutMs=0`)).status, 400);
});

test("answers 504 with the limit used when a read runs out of time", async () => {
  timesOut = true;
  try {
    const response = await compare(`${RUNS}&timeoutMs=800`);

    assert.equal(response.status, 504);
    assert.equal(((await response.json()) as { timeoutMs: number }).timeoutMs, 800);
  } finally {
    timesOut = false;
  }
});
