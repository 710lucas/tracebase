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
  type ShortestPathOptions,
} from "../../../../src/core/ports/graph-repository/index.ts";

// `GET /graph/entities/shortest-path`: the real app over the in-memory repository, which answers the graph's
// questions, and over a repository that sees every call and can run out of time for the one it cannot give.
const calls: (QueryOptions & ShortestPathOptions)[] = [];
let timesOut = false;
let runningServer: Server;
let baseUrl: string;

before(async () => {
  const silencedLog = mock.method(console, "log", () => {});
  const memory = createInMemoryGraphRepository();
  const graphRepository: GraphRepository = {
    ...memory,
    getShortestPath: async (from, to, options) => {
      calls.push(options ?? {});
      if (timesOut) throw new QueryTimeoutError(options?.timeoutMs ?? 30_000);
      return memory.getShortestPath(from, to, options);
    },
  };
  await new Promise<void>((resolve) => {
    runningServer = createApp({ graphRepository, runtimeInfo: { storage: "memory" } }).listen(
      0,
      () => resolve(),
    );
  });
  baseUrl = `http://localhost:${(runningServer.address() as AddressInfo).port}`;

  const link = (from: string, to: string) => ({
    source: { type: "DOMAIN_NAME", value: from },
    target: { type: "DOMAIN_NAME", value: to },
  });
  const send = (run: string, relations: unknown[]) =>
    fetch(`${baseUrl}/imports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: { tool: "spiderfoot", run }, relations, attributes: [] }),
    });
  // a -> b -> c -> d, and between a and b a second observation and a relation the other way.
  await send("scan-1", [
    link("a.test", "b.test"),
    link("b.test", "c.test"),
    link("c.test", "d.test"),
  ]);
  await send("scan-2", [link("a.test", "b.test"), link("b.test", "a.test")]);
  silencedLog.mock.restore();
});

after(async () => {
  await new Promise((resolve) => runningServer.close(resolve));
});

function getPath(query: string) {
  return fetch(`${baseUrl}/graph/entities/shortest-path?${query}`);
}

function between(from: string, to: string, extra = "") {
  return `fromType=DOMAIN_NAME&fromValue=${from}&toType=DOMAIN_NAME&toValue=${to}${extra}`;
}

interface Body {
  maxHops: number;
  entities: { value: string }[];
  steps: {
    from: { value: string };
    to: { value: string };
    relations: { source: { value: string }; provenance: { tool: string; run: string } }[];
  }[];
}

test("answers 200 with the path, and in each step every relation with its direction and provenance", async () => {
  const response = await getPath(between("a.test", "d.test"));
  const body = (await response.json()) as Body;

  assert.equal(response.status, 200);
  assert.deepEqual(
    body.entities.map(({ value }) => value),
    ["a.test", "b.test", "c.test", "d.test"],
  );
  assert.equal(body.steps.length, 3);
  assert.deepEqual(
    body.steps[0]?.relations
      .map(({ source, provenance }) => `${source.value}@${provenance.run}`)
      .sort(),
    ["a.test@scan-1", "a.test@scan-2", "b.test@scan-2"],
  );
  assert.equal(body.steps[0]?.relations[0]?.provenance.tool, "spiderfoot");
  assert.equal(body.maxHops, 6);
});

test("the direction of the relations does not matter", async () => {
  const body = (await (await getPath(between("d.test", "a.test"))).json()) as Body;

  assert.deepEqual(
    body.entities.map(({ value }) => value),
    ["d.test", "c.test", "b.test", "a.test"],
  );
});

test("a path from an entity to itself is that entity and has no step", async () => {
  const body = (await (await getPath(between("a.test", "a.test"))).json()) as Body;

  assert.deepEqual(
    body.entities.map(({ value }) => value),
    ["a.test"],
  );
  assert.deepEqual(body.steps, []);
});

test("a path longer than maxHops is an empty path, not an error", async () => {
  const response = await getPath(between("a.test", "d.test", "&maxHops=2"));
  const body = (await response.json()) as Body;

  assert.equal(response.status, 200);
  assert.deepEqual(body.entities, []);
  assert.deepEqual(body.steps, []);
  assert.equal(body.maxHops, 2);
});

test("passes the maxHops and the time limit of the request on, and none when it gives none", async () => {
  calls.length = 0;
  await getPath(between("a.test", "b.test"));
  await getPath(between("a.test", "b.test", "&maxHops=9&timeoutMs=1500"));

  assert.deepEqual(calls, [{}, { maxHops: 9, timeoutMs: 1500 }]);
});

test("answers 404 when either entity is not in the graph", async () => {
  for (const query of [
    between("a.test", "nobody.test"),
    between("nobody.test", "a.test"),
    between("nobody.test", "nobody-2.test"),
  ]) {
    const response = await getPath(query);

    assert.equal(response.status, 404);
    assert.match(((await response.json()) as { error: string }).error, /not found/);
  }
});

for (const [description, query] of [
  ["no parameters", ""],
  ["no fromType", "fromValue=a.test&toType=DOMAIN_NAME&toValue=b.test"],
  ["no toValue", "fromType=DOMAIN_NAME&fromValue=a.test&toType=DOMAIN_NAME"],
  ["a parameter given twice", between("a.test", "b.test", "&fromType=X")],
] as const) {
  test(`answers 400 for ${description}`, async () => {
    const response = await getPath(query);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "query parameters fromType, fromValue, toType and toValue are required",
    });
  });
}

test("answers 400 with the domain's reason when a value is blank", async () => {
  const response = await getPath(
    "fromType=DOMAIN_NAME&fromValue=%20&toType=DOMAIN_NAME&toValue=b.test",
  );

  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /value must not be blank/);
});

for (const maxHops of ["abc", "1.5", "-1", "1&maxHops=2"]) {
  test(`answers 400 for maxHops=${maxHops}`, async () => {
    const response = await getPath(between("a.test", "b.test", `&maxHops=${maxHops}`));

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "maxHops is a whole number, given once" });
  });
}

test("answers 400 with the core's reason for maxHops=0", async () => {
  const response = await getPath(between("a.test", "b.test", "&maxHops=0"));

  assert.equal(response.status, 400);
  assert.match(
    ((await response.json()) as { error: string }).error,
    /Invalid shortest path options/,
  );
});

test("answers 400 for a time limit that is not a whole number from 1", async () => {
  assert.equal((await getPath(between("a.test", "b.test", "&timeoutMs=0"))).status, 400);
});

test("answers 504 with the limit used when the read runs out of time", async () => {
  timesOut = true;
  try {
    const response = await getPath(between("a.test", "b.test", "&timeoutMs=2000"));

    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), {
      error: "Query exceeded 2 s; reduce depth, limit or filter",
      timeoutMs: 2000,
    });
  } finally {
    timesOut = false;
  }
});
