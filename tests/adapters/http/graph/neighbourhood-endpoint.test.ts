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

interface Body {
  hops: number;
  maxEntities: number;
  truncated: boolean;
  hint?: string;
  entities: { entity: { value: string }; distance: number; attributes: unknown[] }[];
  relations: unknown[];
}

test("answers 200 with the entities, their distances, the relations and the attributes", async () => {
  const response = await getNeighbourhood(ORIGIN);
  const body = (await response.json()) as Body;

  assert.equal(response.status, 200);
  assert.deepEqual(
    body.entities.map(({ entity, distance }) => [entity.value, distance]),
    [
      ["a.example.com", 0],
      ["b.example.com", 1],
      ["c.example.com", 2],
      ["d.example.com", 3],
    ],
  );
  assert.equal(body.entities[1]?.attributes.length, 1);
  assert.equal(body.relations.length, 3);
  assert.equal(body.hops, 3);
  assert.equal(body.maxEntities, 300);
  assert.equal(body.truncated, false);
  assert.equal("hint" in body, false);
});

test("goes only as far as the hops asked", async () => {
  const body = (await (await getNeighbourhood(`${ORIGIN}&hops=1`)).json()) as Body;

  assert.deepEqual(
    body.entities.map(({ entity }) => entity.value),
    ["a.example.com", "b.example.com"],
  );
});

test("cuts at maxEntities, says so and tells the caller what to do", async () => {
  const response = await getNeighbourhood(`${ORIGIN}&maxEntities=2`);
  const body = (await response.json()) as Body;

  assert.equal(response.status, 200);
  assert.equal(body.entities.length, 2);
  assert.equal(body.truncated, true);
  assert.match(body.hint ?? "", /bigger maxEntities and a bigger timeoutMs/);
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

for (const query of ["hops=abc", "hops=1.5", "hops=-1", "maxEntities=x", "hops=1&hops=2"]) {
  test(`answers 400 for "${query}"`, async () => {
    const response = await getNeighbourhood(`${ORIGIN}&${query}`);

    assert.equal(response.status, 400);
    assert.match(((await response.json()) as { error: string }).error, /hops and maxEntities/);
  });
}

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
