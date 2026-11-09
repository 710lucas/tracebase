import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../../../src/adapters/http/index.ts";
import { createInMemoryGraphRepository } from "../../../../src/adapters/memory/in-memory-graph-repository.ts";
import {
  QueryTimeoutError,
  type EntityQuery,
  type GraphRepository,
  type QueryOptions,
} from "../../../../src/core/ports/graph-repository/index.ts";

// `POST /graph/query`: the real app over the in-memory repository, which answers the graph's questions, and
// over a repository that sees every call and can run out of time.
const calls: { query: EntityQuery | undefined; options: QueryOptions | undefined }[] = [];
let timesOut = false;
let runningServer: Server;
let baseUrl: string;

before(async () => {
  const silencedLog = mock.method(console, "log", () => {});
  const memory = createInMemoryGraphRepository();
  const graphRepository: GraphRepository = {
    ...memory,
    queryEntities: async (query, options) => {
      calls.push({ query, options });
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

  await fetch(`${baseUrl}/imports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: { tool: "spiderfoot", run: "scan-1" },
      relations: [
        {
          source: { type: "DOMAIN_NAME", value: "b.example.com" },
          target: { type: "DOMAIN_NAME", value: "a.example.com" },
          provenance: { module: "sfp_dns" },
        },
        {
          source: { type: "DOMAIN_NAME", value: "a.example.com" },
          target: { type: "IP_ADDRESS", value: "10.0.0.1" },
        },
      ],
      attributes: [
        {
          entity: { type: "IP_ADDRESS", value: "10.0.0.1" },
          name: "WEBSERVER_BANNER",
          values: ["nginx/1.25 for example.com"],
          qualifier: "sfp_webserver",
        },
      ],
    }),
  });
  silencedLog.mock.restore();
});

after(async () => {
  await new Promise((resolve) => runningServer.close(resolve));
});

function post(
  body: unknown,
  headers: Record<string, string> = { "Content-Type": "application/json" },
) {
  return fetch(`${baseUrl}/graph/query`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

interface Page {
  mode: string;
  limit: number;
  offset: number;
  snippetLength: number;
  results: {
    entity: { type: string; value: string };
    matches: { name: string; qualifier?: string; snippet: string; history?: true }[];
  }[];
  truncated: boolean;
  nextOffset?: number;
}

const values = (page: Page) => page.results.map(({ entity }) => entity.value);

test("an empty body object is the whole graph, as a page with the defaults filled in", async () => {
  const response = await post({});
  const page = (await response.json()) as Page;

  assert.equal(response.status, 200);
  assert.deepEqual(values(page), ["10.0.0.1", "a.example.com", "b.example.com"]);
  assert.deepEqual(
    [page.mode, page.limit, page.offset, page.snippetLength, page.truncated],
    ["list", 50, 0, 200, false],
  );
});

test("the types and the value narrow the page", async () => {
  const page = (await (
    await post({ types: ["DOMAIN_NAME"], value: { text: "B.EXAMPLE", match: "insensitive" } })
  ).json()) as Page;

  assert.deepEqual(values(page), ["b.example.com"]);
});

test("an attribute condition with a text lists the snippet where it was met", async () => {
  const page = (await (
    await post({ attributes: [{ name: "WEBSERVER_BANNER", text: "nginx" }] })
  ).json()) as Page;

  assert.deepEqual(values(page), ["10.0.0.1"]);
  assert.deepEqual(page.results[0]?.matches, [
    { name: "WEBSERVER_BANNER", qualifier: "sfp_webserver", snippet: "nginx/1.25 for example.com" },
  ]);
});

test("a provenance filter finds the entities a module saw", async () => {
  const page = (await (await post({ provenance: { module: "sfp_dns" } })).json()) as Page;

  assert.deepEqual(values(page), ["a.example.com", "b.example.com"]);
});

test("the mode count answers the total and the count by type", async () => {
  const response = await post({ mode: "count" });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    mode: "count",
    total: 3,
    byType: [
      { type: "DOMAIN_NAME", count: 2 },
      { type: "IP_ADDRESS", count: 1 },
    ],
  });
});

test("the pages, read one after the other, give every entity once", async () => {
  const everything: string[] = [];
  let offset: number | undefined = 0;
  while (offset !== undefined) {
    const page = (await (await post({ limit: 2, offset })).json()) as Page;
    everything.push(...values(page));
    offset = page.nextOffset;
  }

  assert.deepEqual(everything, ["10.0.0.1", "a.example.com", "b.example.com"]);
});

test("a query that finds nothing is a 200 with an empty page", async () => {
  const response = await post({ types: ["NOBODY_HAS_THIS"] });

  assert.equal(response.status, 200);
  assert.deepEqual(((await response.json()) as Page).results, []);
});

test("passes the query on without the time limit, and the time limit on its own", async () => {
  calls.length = 0;
  await post({ types: ["DOMAIN_NAME"], limit: 7, includeHistory: true, timeoutMs: 1500 });
  await post({});

  assert.deepEqual(calls, [
    {
      query: { types: ["DOMAIN_NAME"], limit: 7, includeHistory: true },
      options: { timeoutMs: 1500 },
    },
    { query: {}, options: {} },
  ]);
});

test("answers 400 with the core's reason when the query makes no sense", async () => {
  for (const [body, reason] of [
    [{ types: [] }, /types must have at least one type/],
    [{ value: { text: "  " } }, /the text of the value/],
    [{ limit: 0 }, /limit must be a whole number from 1/],
    [{ attributes: [{ name: "" }] }, /the name of an attribute/],
    [{ provenance: {} }, /provenance needs at least one/],
    [{ offset: 5 }, /offset 5 is past the end/],
  ] as const) {
    const response = await post(body);

    assert.equal(response.status, 400);
    assert.match(((await response.json()) as { error: string }).error, reason);
  }
});

test("answers 400 for a field the query does not have, so a typo is not lost", async () => {
  const response = await post({ includeHistroy: true });
  const body = (await response.json()) as { error: string; issues: { path: string }[] };

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid query");
  assert.ok(body.issues.length > 0);
});

test("answers 400 for a field with the wrong type, or a match or mode that does not exist", async () => {
  for (const body of [
    { types: "DOMAIN_NAME" },
    { value: { text: 5 } },
    { includeHistory: "yes" },
    { limit: "5" },
    { mode: "table" },
    { value: { text: "x", match: "fuzzy" } },
    { attributes: [{ text: "x" }] },
    { timeoutMs: 0 },
    { timeoutMs: 1.5 },
  ]) {
    const response = await post(body);

    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(((await response.json()) as { error: string }).error, "invalid query");
  }
});

test("answers 400 for a body that is not JSON, or is not sent as JSON", async () => {
  const notJson = await post("{not json");
  const wrongType = await post("{}", { "Content-Type": "text/plain" });
  const noBody = await fetch(`${baseUrl}/graph/query`, { method: "POST" });

  assert.equal(notJson.status, 400);
  assert.deepEqual(await notJson.json(), { error: "invalid JSON" });
  for (const response of [wrongType, noBody]) {
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "expected a JSON body with Content-Type: application/json",
    });
  }
});

test("answers 504 with the time limit used when the read runs out of time", async () => {
  timesOut = true;
  try {
    const response = await post({ timeoutMs: 250 });

    assert.equal(response.status, 504);
    assert.equal(((await response.json()) as { timeoutMs: number }).timeoutMs, 250);
  } finally {
    timesOut = false;
  }
});
