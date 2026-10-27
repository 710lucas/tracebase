import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../../../src/adapters/http/index.ts";
import { createInMemoryGraphRepository } from "../../../../src/adapters/memory/in-memory-graph-repository.ts";

let runningServer: Server;
let baseUrl: string;

before(async () => {
  // The import route logs what it saves; the import below is on purpose, so the log is silenced.
  const silencedLog = mock.method(console, "log", () => {});
  await new Promise<void>((resolve) => {
    runningServer = createApp({ graphRepository: createInMemoryGraphRepository() }).listen(0, () =>
      resolve(),
    );
  });
  baseUrl = `http://localhost:${(runningServer.address() as AddressInfo).port}`;

  // The graph is filled through the real import route, so these tests also prove that what comes in
  // through POST /imports can be read back through GET /graph/entities.
  await fetch(`${baseUrl}/imports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: { tool: "spiderfoot", run: "scan-1" },
      relations: [
        {
          source: { type: "DOMAIN_NAME", value: "example.com" },
          target: ipAddress,
          type: "resolves_to",
          provenance: { module: "sfp_dnsresolve", confidence: 100, observedAt: 1760000000000 },
        },
        {
          source: { type: "USERNAME", value: "710lucas" },
          target: multilineAccount,
        },
      ],
      attributes: [
        {
          entity: ipAddress,
          name: "WEBSERVER_BANNER",
          value: "nginx/1.25",
          provenance: { module: "sfp_webserver" },
        },
      ],
    }),
  });
  silencedLog.mock.restore();
});

after(async () => {
  await new Promise((resolve) => runningServer.close(resolve));
});

const ipAddress = { type: "IP_ADDRESS", value: "93.184.216.34" };
// A real kind of value from SpiderFoot: several lines, spaces and a URL.
const multilineAccount = {
  type: "ACCOUNT_EXTERNAL_OWNED",
  value: "Docker Hub (User) (Category: coding)\nhttps://hub.docker.com/u/710lucas",
};

function findEntity(query: string) {
  return fetch(`${baseUrl}/graph/entities?${query}`);
}

function queryFor(entity: { type: string; value: string }) {
  return `type=${encodeURIComponent(entity.type)}&value=${encodeURIComponent(entity.value)}`;
}

interface Findings {
  relations: { provenance: Record<string, unknown> }[];
  attributes: { provenance: Record<string, unknown> }[];
}

// The time of reception changes on every run, so the test checks that it is there and compares the rest.
function withoutRecordedAt(findings: Findings): Findings {
  for (const item of [...findings.relations, ...findings.attributes]) {
    assert.equal(typeof item.provenance["recordedAt"], "number");
    delete item.provenance["recordedAt"];
  }
  return findings;
}

test("answers 200 with the entity, its relations and its attributes, each with provenance", async () => {
  const response = await findEntity(queryFor(ipAddress));

  assert.equal(response.status, 200);
  assert.deepEqual(withoutRecordedAt(await response.json()), {
    entity: ipAddress,
    relations: [
      {
        source: { type: "DOMAIN_NAME", value: "example.com" },
        target: ipAddress,
        type: "resolves_to",
        provenance: {
          tool: "spiderfoot",
          run: "scan-1",
          module: "sfp_dnsresolve",
          confidence: 100,
          observedAt: 1760000000000,
        },
      },
    ],
    attributes: [
      {
        entity: ipAddress,
        name: "WEBSERVER_BANNER",
        value: "nginx/1.25",
        provenance: { tool: "spiderfoot", run: "scan-1", module: "sfp_webserver" },
      },
    ],
  });
});

test("an entity that appears only as the source of a relation is found", async () => {
  const response = await findEntity(queryFor({ type: "DOMAIN_NAME", value: "example.com" }));

  assert.equal(response.status, 200);
  const body = (await response.json()) as { relations: unknown[]; attributes: unknown[] };
  assert.equal(body.relations.length, 1);
  assert.deepEqual(body.attributes, []);
});

test("a value with several lines, spaces and a URL is found through the query string", async () => {
  const response = await findEntity(queryFor(multilineAccount));

  assert.equal(response.status, 200);
  const body = (await response.json()) as { entity: { value: string } };
  assert.equal(body.entity.value, multilineAccount.value);
});

test("answers 404 when nothing in the graph mentions the entity", async () => {
  const response = await findEntity(queryFor({ type: "IP_ADDRESS", value: "10.0.0.99" }));

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "entity not found" });
});

const BAD_QUERIES: [string, string][] = [
  ["no parameters", ""],
  ["no value", "type=IP_ADDRESS"],
  ["no type", "value=93.184.216.34"],
  ["a parameter given twice", "type=IP_ADDRESS&type=DOMAIN_NAME&value=x"],
];

for (const [description, query] of BAD_QUERIES) {
  test(`answers 400 for ${description}`, async () => {
    const response = await findEntity(query);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "query parameters type and value are required",
    });
  });
}

test("answers 400 with the domain's reason when the type is blank", async () => {
  const response = await findEntity("type=%20&value=93.184.216.34");

  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /type must not be blank/);
});

test("a method the route does not define is not found", async () => {
  const response = await fetch(`${baseUrl}/graph/entities`, { method: "POST" });

  assert.equal(response.status, 404);
});
