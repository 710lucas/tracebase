import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../../src/adapters/http/index.ts";
import { createInMemoryGraphRepository } from "../../../src/adapters/memory/in-memory-graph-repository.ts";

// The routes that show what the graph holds (runs, types, entity pages, status) and the front end's
// files, through the real application and the in-memory repository. The graph is filled through the
// real import route.
let runningServer: Server;
let baseUrl: string;
let webRoot: string;

before(async () => {
  webRoot = await mkdtemp(join(tmpdir(), "tracebase-web-"));
  await writeFile(join(webRoot, "index.html"), "<h1>tracebase</h1>");

  await new Promise<void>((resolve) => {
    runningServer = createApp({
      graphRepository: createInMemoryGraphRepository(),
      runtimeInfo: { storage: "memory" },
      webRoot,
    }).listen(0, () => resolve());
  });
  baseUrl = `http://localhost:${(runningServer.address() as AddressInfo).port}`;

  // The import route logs what it saves; the import below is on purpose, so the log is silenced.
  const silencedLog = mock.method(console, "log", () => {});
  await fetch(`${baseUrl}/imports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: { tool: "spiderfoot", run: "scan-1" },
      relations: [
        {
          source: { type: "DOMAIN_NAME", value: "example.com" },
          target: { type: "IP_ADDRESS", value: "93.184.216.34" },
        },
        {
          source: { type: "DOMAIN_NAME", value: "another.org" },
          target: { type: "IP_ADDRESS", value: "93.184.216.34" },
        },
      ],
      attributes: [
        {
          entity: { type: "IP_ADDRESS", value: "93.184.216.34" },
          name: "WEBSERVER_BANNER",
          values: ["nginx/1.25"],
        },
      ],
    }),
  });
  silencedLog.mock.restore();
});

after(async () => {
  await new Promise((resolve) => runningServer.close(resolve));
  await rm(webRoot, { recursive: true });
});

test("GET /imports lists the runs with their counts", async () => {
  const response = await fetch(`${baseUrl}/imports`);
  const body = (await response.json()) as { runs: Record<string, unknown>[] };

  assert.equal(response.status, 200);
  assert.equal(body.runs.length, 1);
  assert.deepEqual(
    { ...body.runs[0], receivedAt: typeof body.runs[0]?.["receivedAt"] },
    { tool: "spiderfoot", run: "scan-1", relations: 2, attributes: 1, receivedAt: "number" },
  );
});

test("GET /graph/types lists the entity types with their counts", async () => {
  const response = await fetch(`${baseUrl}/graph/types`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    types: [
      { type: "DOMAIN_NAME", count: 2 },
      { type: "IP_ADDRESS", count: 1 },
    ],
  });
});

test("GET /graph/types/:type/entities answers a page and the total", async () => {
  const response = await fetch(`${baseUrl}/graph/types/DOMAIN_NAME/entities?limit=1&offset=1`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    total: 2,
    entities: [{ type: "DOMAIN_NAME", value: "example.com" }],
  });
});

test("the entity list filters by the search text", async () => {
  const response = await fetch(`${baseUrl}/graph/types/DOMAIN_NAME/entities?search=ANOTHER`);

  assert.deepEqual(await response.json(), {
    total: 1,
    entities: [{ type: "DOMAIN_NAME", value: "another.org" }],
  });
});

test("the entity list compares the search text the way match says", async () => {
  const list = async (query: string) =>
    (
      (await (await fetch(`${baseUrl}/graph/types/DOMAIN_NAME/entities?${query}`)).json()) as {
        entities: { value: string }[];
      }
    ).entities.map(({ value }) => value);

  assert.deepEqual(await list("search=another.org&match=exact"), ["another.org"]);
  assert.deepEqual(await list("search=another&match=exact"), []);
  assert.deepEqual(await list("search=ANOTHER&match=contains"), []);
  assert.deepEqual(await list("search=ANOTHER&match=insensitive"), ["another.org"]);
});

test("the entity list rejects a match mode that does not exist with 400", async () => {
  const response = await fetch(`${baseUrl}/graph/types/DOMAIN_NAME/entities?search=a&match=fuzzy`);

  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /match is one of/);
});

test("an entity list with a type nobody has is empty, not an error", async () => {
  const response = await fetch(`${baseUrl}/graph/types/NOPE/entities`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { total: 0, entities: [] });
});

for (const query of [
  "limit=0",
  "limit=201",
  "limit=abc",
  "offset=-1",
  "limit=1&limit=2",
  "search=a&search=b",
]) {
  test(`the entity list rejects ${query} with 400`, async () => {
    const response = await fetch(`${baseUrl}/graph/types/DOMAIN_NAME/entities?${query}`);

    assert.equal(response.status, 400);
    assert.match(((await response.json()) as { error: string }).error, /limit/);
  });
}

test("GET /status reports the storage and the size of the graph", async () => {
  const response = await fetch(`${baseUrl}/status`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    storage: "memory",
    reachable: true,
    totals: { entities: 3, relations: 2, attributes: 1 },
  });
});

test("serves the front end's files, and the API routes still win", async () => {
  const page = await fetch(`${baseUrl}/`);

  assert.equal(page.status, 200);
  assert.match(await page.text(), /tracebase/);
  assert.equal(
    (await fetch(`${baseUrl}/status`)).headers.get("content-type")?.includes("json"),
    true,
  );
});

test("a path that is neither a route nor a file is still the JSON 404", async () => {
  const response = await fetch(`${baseUrl}/nothing-here`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not found" });
});
