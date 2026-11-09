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
  type SearchOptions,
} from "../../../../src/core/ports/graph-repository/index.ts";

// `GET /graph/search`: the real app over the in-memory repository, which answers the graph's questions, and
// over a repository that sees every call and can run out of time for the one it cannot give.
const calls: (QueryOptions & SearchOptions)[] = [];
let timesOut = false;
let runningServer: Server;
let baseUrl: string;

before(async () => {
  const silencedLog = mock.method(console, "log", () => {});
  const memory = createInMemoryGraphRepository();
  const graphRepository: GraphRepository = {
    ...memory,
    searchEntities: async (text, options) => {
      calls.push(options ?? {});
      if (timesOut) throw new QueryTimeoutError(options?.timeoutMs ?? 30_000);
      return memory.searchEntities(text, options);
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

function search(query: string) {
  return fetch(`${baseUrl}/graph/search?${query}`);
}

interface Page {
  text: string;
  scope: string;
  limit: number;
  offset: number;
  maxMatches: number;
  snippetLength: number;
  results: {
    entity: { type: string; value: string };
    matches: { where: string; name?: string; qualifier?: string; snippet: string }[];
    moreMatches?: number;
  }[];
  truncated: boolean;
  nextOffset?: number;
}

test("answers 200 with the entities whose value matches first, then the ones that match in an attribute", async () => {
  const response = await search("text=EXAMPLE.com");
  const page = (await response.json()) as Page;

  assert.equal(response.status, 200);
  assert.deepEqual(
    page.results.map(({ entity }) => entity.value),
    ["a.example.com", "b.example.com", "10.0.0.1"],
  );
  assert.deepEqual(page.results[2]?.matches, [
    {
      where: "attribute",
      name: "WEBSERVER_BANNER",
      qualifier: "sfp_webserver",
      snippet: "nginx/1.25 for example.com",
    },
  ]);
  assert.equal(page.results[0]?.matches[0]?.where, "entity-value");
});

test("repeats what was asked with the defaults filled in", async () => {
  const page = (await (await search("text=example")).json()) as Page;

  assert.deepEqual(
    [page.text, page.scope, page.limit, page.offset, page.maxMatches, page.snippetLength],
    ["example", "full", 50, 0, 100, 200],
  );
  assert.equal(page.truncated, false);
  assert.equal("nextOffset" in page, false);
});

test("with the scope entity-value it does not look at the attributes", async () => {
  const page = (await (await search("text=nginx&scope=entity-value")).json()) as Page;

  assert.deepEqual(page.results, []);
});

test("the pages, read one after the other, give every result once", async () => {
  const values: string[] = [];
  let offset: number | undefined = 0;
  const pages: Page[] = [];
  while (offset !== undefined) {
    const page = (await (await search(`text=example&limit=2&offset=${offset}`)).json()) as Page;
    pages.push(page);
    values.push(...page.results.map(({ entity }) => entity.value));
    offset = page.nextOffset;
  }

  assert.equal(pages.length, 2);
  assert.deepEqual(values, ["a.example.com", "b.example.com", "10.0.0.1"]);
  assert.deepEqual(
    pages.map((page) => [page.offset, page.truncated]),
    [
      [0, true],
      [2, false],
    ],
  );
});

test("the maxMatches and the snippetLength of the request are used", async () => {
  const page = (await (await search("text=example&snippetLength=5&maxMatches=1")).json()) as Page;

  assert.equal(page.maxMatches, 1);
  assert.equal(page.snippetLength, 5);
  assert.equal(page.results[0]?.matches[0]?.snippet, "…examp…");
});

test("a search that finds nothing is a 200 with an empty page", async () => {
  const response = await search("text=nothing-has-this");

  assert.equal(response.status, 200);
  assert.deepEqual(((await response.json()) as Page).results, []);
});

test("passes the options of the request on, and none when it gives none", async () => {
  calls.length = 0;
  await search("text=x");
  await search(
    "text=x&scope=entity-value&limit=7&offset=0&maxMatches=3&snippetLength=9&timeoutMs=1500",
  );

  assert.deepEqual(calls, [
    {},
    {
      scope: "entity-value",
      limit: 7,
      offset: 0,
      maxMatches: 3,
      snippetLength: 9,
      timeoutMs: 1500,
    },
  ]);
});

test("answers 400 when the text is missing or given twice", async () => {
  for (const query of ["", "limit=5", "text=a&text=b"]) {
    const response = await search(query);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "query parameter text is required" });
  }
});

test("answers 400 with the core's reason when the text has no character", async () => {
  for (const query of ["text=", "text=%20%20"]) {
    const response = await search(query);

    assert.equal(response.status, 400);
    assert.match(((await response.json()) as { error: string }).error, /at least one character/);
  }
});

test("answers 400 for a scope that does not exist", async () => {
  const response = await search("text=x&scope=everything");

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "scope is one of entity-value, full, given once",
  });
});

for (const query of [
  "limit=abc",
  "limit=1.5",
  "offset=-1",
  "maxMatches=x",
  "snippetLength=y",
  "limit=1&limit=2",
]) {
  test(`answers 400 for ${query}`, async () => {
    const response = await search(`text=x&${query}`);

    assert.equal(response.status, 400);
    assert.match(((await response.json()) as { error: string }).error, /whole numbers/);
  });
}

for (const query of ["limit=0", "maxMatches=0", "snippetLength=0"]) {
  test(`answers 400 with the core's reason for ${query}`, async () => {
    const response = await search(`text=x&${query}`);

    assert.equal(response.status, 400);
    assert.match(((await response.json()) as { error: string }).error, /Invalid search/);
  });
}

test("answers 400 with the number of entities when the offset is past the end", async () => {
  const response = await search("text=example&offset=3");

  assert.equal(response.status, 400);
  assert.match(
    ((await response.json()) as { error: string }).error,
    /offset 3 is past the end: the search found 3 entities/,
  );
});

test("answers 400 for a time limit that is not a whole number from 1", async () => {
  assert.equal((await search("text=x&timeoutMs=0")).status, 400);
});

test("answers 504 with the limit used when the read runs out of time", async () => {
  timesOut = true;
  try {
    const response = await search("text=x&timeoutMs=2000");

    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), {
      error: "Query exceeded 2 s; reduce depth, limit or filter",
      timeoutMs: 2000,
    });
  } finally {
    timesOut = false;
  }
});
