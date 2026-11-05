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

// `GET /graph/entities/neighbourhood`: the real app over the in-memory repository, which answers the
// graph's questions, and over a repository that can run out of time for the one it cannot give.
let timesOut = false;
let runningServer: Server;
let baseUrl: string;

before(async () => {
  const silencedLog = mock.method(console, "log", () => {});
  const memory = createInMemoryGraphRepository();
  const graphRepository: GraphRepository = {
    ...memory,
    getEntityNeighbourhood: async (entity, options) => {
      if (timesOut) throw new QueryTimeoutError(options?.timeoutMs ?? 30_000);
      return memory.getEntityNeighbourhood(entity, options);
    },
  };
  await new Promise<void>((resolve) => {
    runningServer = createApp({ graphRepository, runtimeInfo: { storage: "memory" } }).listen(
      0,
      () => resolve(),
    );
  });
  baseUrl = `http://localhost:${(runningServer.address() as AddressInfo).port}`;

  // a.example.com -> b.example.com -> c.example.com -> d.example.com
  const link = (from: string, to: string) => ({
    source: { type: "DOMAIN_NAME", value: from },
    target: { type: "DOMAIN_NAME", value: to },
  });
  await fetch(`${baseUrl}/imports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: { tool: "spiderfoot", run: "scan-1" },
      relations: [
        link("a.example.com", "b.example.com"),
        link("b.example.com", "c.example.com"),
        link("c.example.com", "d.example.com"),
      ],
      attributes: [
        {
          entity: { type: "DOMAIN_NAME", value: "b.example.com" },
          name: "WEBSERVER_BANNER",
          values: ["nginx"],
        },
      ],
    }),
  });
  silencedLog.mock.restore();
});

after(async () => {
  await new Promise((resolve) => runningServer.close(resolve));
});

function getNeighbourhood(query: string) {
  return fetch(`${baseUrl}/graph/entities/neighbourhood?${query}`);
}

const ORIGIN = "type=DOMAIN_NAME&value=a.example.com";

interface LeanBody {
  origin: { type: string; value: string; attributes?: { name: string; values: string[] }[] };
  hops: number;
  maxEntities: number;
  offset: number;
  truncated: boolean;
  nextOffset?: number;
  hint?: string;
  entities: { type: string; value: string; distance: number }[];
  relations: { source: { value: string }; target: { value: string }; type?: string }[];
}

interface FullBody {
  entities: { entity: { value: string }; distance: number; attributes: unknown[] }[];
  relations: { provenance: unknown }[];
}

test("answers 200 with the lean neighbourhood: the origin, the others with their distance, the relations", async () => {
  const response = await getNeighbourhood(ORIGIN);
  const body = (await response.json()) as LeanBody;

  assert.equal(response.status, 200);
  assert.deepEqual(body.origin, { type: "DOMAIN_NAME", value: "a.example.com", attributes: [] });
  assert.deepEqual(
    body.entities.map(({ value, distance }) => [value, distance]),
    [
      ["b.example.com", 1],
      ["c.example.com", 2],
      ["d.example.com", 3],
    ],
  );
  assert.equal(body.relations.length, 3);
  assert.deepEqual(body.relations[0]?.source, { type: "DOMAIN_NAME", value: "a.example.com" });
  assert.equal("provenance" in (body.relations[0] ?? {}), false);
  assert.equal(body.hops, 3);
  assert.equal(body.maxEntities, 200);
  assert.equal(body.truncated, false);
  assert.equal("hint" in body, false);
});

test("the lean answer keeps the attributes of the origin and of nothing else", async () => {
  const body = (await (
    await getNeighbourhood("type=DOMAIN_NAME&value=b.example.com")
  ).json()) as LeanBody;

  assert.deepEqual(body.origin.attributes, [{ name: "WEBSERVER_BANNER", values: ["nginx"] }]);
  assert.equal(
    body.entities.every((entity) => !("attributes" in entity)),
    true,
  );
});

test("detail=full brings the attributes of every entity and the provenance of every relation", async () => {
  const response = await getNeighbourhood(`${ORIGIN}&detail=full&hops=1`);
  const body = (await response.json()) as FullBody;

  assert.equal(response.status, 200);
  assert.deepEqual(
    body.entities.map(({ entity, distance }) => [entity.value, distance]),
    [
      ["a.example.com", 0],
      ["b.example.com", 1],
    ],
  );
  assert.equal(body.entities[1]?.attributes.length, 1);
  assert.notEqual(body.relations[0]?.provenance, undefined);
});

test("detail=lean is the same as no detail", async () => {
  const withoutDetail = await (await getNeighbourhood(ORIGIN)).json();
  const lean = await (await getNeighbourhood(`${ORIGIN}&detail=lean`)).json();

  assert.deepEqual(lean, withoutDetail);
});

test("goes only as far as the hops asked", async () => {
  const body = (await (await getNeighbourhood(`${ORIGIN}&hops=1`)).json()) as LeanBody;

  assert.deepEqual(
    body.entities.map(({ value }) => value),
    ["b.example.com"],
  );
});

test("cuts at maxEntities, says so and tells the caller what to do", async () => {
  const response = await getNeighbourhood(`${ORIGIN}&maxEntities=2`);
  const body = (await response.json()) as LeanBody;

  assert.equal(response.status, 200);
  // The origin counts as one of the two.
  assert.equal(body.entities.length, 1);
  assert.equal(body.truncated, true);
  assert.match(body.hint ?? "", /bigger maxEntities and a bigger timeoutMs/);
});

test("the full answer also says it was cut", async () => {
  const body = (await (await getNeighbourhood(`${ORIGIN}&maxEntities=2&detail=full`)).json()) as {
    truncated: boolean;
    hint?: string;
  };

  assert.equal(body.truncated, true);
  assert.notEqual(body.hint, undefined);
});

test("answers 404 when nothing in the graph mentions the entity", async () => {
  const response = await getNeighbourhood("type=DOMAIN_NAME&value=nobody.example.com");

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "entity not found" });
});

test("answers 400 when type or value is missing", async () => {
  assert.equal((await getNeighbourhood("type=DOMAIN_NAME")).status, 400);
});

test("answers 400 with the domain's reason when the value is blank", async () => {
  const response = await getNeighbourhood("type=DOMAIN_NAME&value=%20");

  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /value must not be blank/);
});

for (const query of [
  "hops=abc",
  "hops=1.5",
  "hops=-1",
  "maxEntities=x",
  "offset=abc",
  "offset=-1",
  "offset=1.5",
  "hops=1&hops=2",
  "offset=1&offset=2",
]) {
  test(`answers 400 for "${query}"`, async () => {
    const response = await getNeighbourhood(`${ORIGIN}&${query}`);

    assert.equal(response.status, 400);
    assert.match(
      ((await response.json()) as { error: string }).error,
      /hops, maxEntities and offset/,
    );
  });
}

test("answers 400 for a detail that is neither lean nor full", async () => {
  const response = await getNeighbourhood(`${ORIGIN}&detail=everything`);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "detail is lean or full, given once" });
});

for (const query of ["hops=0", "maxEntities=0"]) {
  test(`answers 400 with the core's reason for "${query}"`, async () => {
    const response = await getNeighbourhood(`${ORIGIN}&${query}`);

    assert.equal(response.status, 400);
    assert.match(
      ((await response.json()) as { error: string }).error,
      /Invalid neighbourhood options/,
    );
  });
}

test("answers 400 with the number of entities when the offset is past the end", async () => {
  const response = await getNeighbourhood(`${ORIGIN}&offset=4`);

  assert.equal(response.status, 400);
  assert.match(
    ((await response.json()) as { error: string }).error,
    /offset 4 is past the end: the neighbourhood has 4 entities/,
  );
});

test("the pages, read one after the other, give every entity and every relation once", async () => {
  const entities: string[] = [];
  const relations: string[] = [];
  const pages: LeanBody[] = [];
  let offset: number | undefined = 0;
  while (offset !== undefined) {
    const page = (await (
      await getNeighbourhood(`${ORIGIN}&maxEntities=2&offset=${offset}`)
    ).json()) as LeanBody;
    pages.push(page);
    entities.push(...page.entities.map(({ value }) => value));
    relations.push(
      ...page.relations.map(({ source, target }) => `${source.value}>${target.value}`),
    );
    offset = page.nextOffset;
  }

  assert.equal(pages.length, 2);
  assert.deepEqual(entities, ["b.example.com", "c.example.com", "d.example.com"]);
  assert.deepEqual(relations.sort(), [
    "a.example.com>b.example.com",
    "b.example.com>c.example.com",
    "c.example.com>d.example.com",
  ]);
  assert.deepEqual(
    pages.map((page) => [page.offset, page.truncated]),
    [
      [0, true],
      [2, false],
    ],
  );
});

test("the origin has its attributes in the first page and only type and value after it", async () => {
  const origin = "type=DOMAIN_NAME&value=b.example.com";
  const first = (await (await getNeighbourhood(`${origin}&maxEntities=2`)).json()) as LeanBody;
  const second = (await (
    await getNeighbourhood(`${origin}&maxEntities=2&offset=2`)
  ).json()) as LeanBody;

  assert.deepEqual(first.origin.attributes, [{ name: "WEBSERVER_BANNER", values: ["nginx"] }]);
  assert.deepEqual(second.origin, { type: "DOMAIN_NAME", value: "b.example.com" });
});

test("the hint names the next page when the answer was cut", async () => {
  const body = (await (await getNeighbourhood(`${ORIGIN}&maxEntities=2`)).json()) as LeanBody;

  assert.equal(body.nextOffset, 2);
  assert.match(body.hint ?? "", /offset=2/);
});

test("the full answer carries the offset and the next one too", async () => {
  const body = (await (await getNeighbourhood(`${ORIGIN}&maxEntities=2&detail=full`)).json()) as {
    offset: number;
    nextOffset?: number;
  };

  assert.equal(body.offset, 0);
  assert.equal(body.nextOffset, 2);
});

test("answers 400 for a time limit that is not a whole number from 1", async () => {
  assert.equal((await getNeighbourhood(`${ORIGIN}&timeoutMs=0`)).status, 400);
});

test("answers 504 with the limit used when the read runs out of time", async () => {
  timesOut = true;
  try {
    const response = await getNeighbourhood(`${ORIGIN}&timeoutMs=2000`);

    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), {
      error: "Query exceeded 2 s; reduce depth, limit or filter",
      timeoutMs: 2000,
    });
  } finally {
    timesOut = false;
  }
});
