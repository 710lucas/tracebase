import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../../src/adapters/http/index.ts";
import { createInMemoryGraphRepository } from "../../../src/adapters/memory/in-memory-graph-repository.ts";

let runningServer: Server;
let baseUrl: string;
let importsUrl: string;
const repository = createInMemoryGraphRepository();

before(async () => {
  // Port 0 asks the operating system for a free port, so tests never collide with a running API.
  await new Promise<void>((resolve) => {
    runningServer = createApp({ graphRepository: repository }).listen(0, () => resolve());
  });
  baseUrl = `http://localhost:${(runningServer.address() as AddressInfo).port}`;
  importsUrl = `${baseUrl}/imports`;
});

after(async () => {
  await new Promise((resolve) => runningServer.close(resolve));
});

const JSON_HEADERS = { "Content-Type": "application/json" };

const ipAddress = { type: "IP_ADDRESS", value: "93.184.216.34" };
const validPayload = {
  source: { tool: "spiderfoot", run: "scan-1" },
  relations: [
    {
      source: { type: "DOMAIN_NAME", value: "example.com" },
      target: ipAddress,
      type: "resolves_to",
      provenance: { module: "sfp_dnsresolve", confidence: 100 },
    },
  ],
  attributes: [{ entity: ipAddress, name: "WEBSERVER_BANNER", value: "nginx/1.25" }],
};

function postImportPayload(payload: unknown) {
  return fetch(importsUrl, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

test("a valid payload is accepted and the answer counts what it held", async () => {
  const response = await postImportPayload(validPayload);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { status: "accepted", relations: 1, attributes: 1 });
});

test("an accepted payload is saved in the repository", async () => {
  const relationsBefore = repository.relations.length;
  const attributesBefore = repository.attributes.length;

  await postImportPayload({ ...validPayload, source: { tool: "spiderfoot", run: "saved-run" } });

  assert.equal(repository.relations.length, relationsBefore + 1);
  assert.equal(repository.attributes.length, attributesBefore + 1);
  assert.equal(repository.relations.at(-1)?.provenance.run, "saved-run");
});

test("a failure of the repository is a 500, not a lost request", async () => {
  const failingRepository = {
    ...createInMemoryGraphRepository(),
    save: async () => {
      throw new Error("storage is down");
    },
  };
  const failingApp = createApp({ graphRepository: failingRepository });
  // Express prints the error of a 500 answer unless its environment is "test"; this test expects it.
  failingApp.set("env", "test");
  const failingServer = await new Promise<Server>((resolve) => {
    const server = failingApp.listen(0, () => resolve(server));
  });
  try {
    const url = `http://localhost:${(failingServer.address() as AddressInfo).port}/imports`;
    const response = await fetch(url, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(validPayload),
    });
    assert.equal(response.status, 500);
  } finally {
    await new Promise((resolve) => failingServer.close(resolve));
  }
});

test("a payload with only a source is accepted and empty", async () => {
  const response = await postImportPayload({ source: { tool: "mailscan", run: "run-001" } });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { status: "accepted", relations: 0, attributes: 0 });
});

test("a blank run is rejected even when the batch has no items", async () => {
  const response = await postImportPayload({ source: { tool: "t", run: "" } });
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /run must not be blank/);
});

test("a payload with the wrong structure is a 400 that says where", async () => {
  const response = await postImportPayload({ relations: [{ source: 5 }] });
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string; issues: { path: string }[] };
  assert.equal(body.error, "invalid payload");
  const issuePaths = body.issues.map((issue) => issue.path);
  assert.ok(issuePaths.includes("source"));
  assert.ok(issuePaths.includes("relations.0.source"));
});

test("a field the payload does not define is rejected, so typos are not lost", async () => {
  const response = await postImportPayload({
    source: { tool: "t", run: "r" },
    attributes: [{ entity: ipAddress, name: "n", value: "v", provenance: { confidance: 5 } }],
  });
  assert.equal(response.status, 400);
});

test("a value the domain rejects is a 400 with the domain's reason", async () => {
  const relationsBefore = repository.relations.length;
  const response = await postImportPayload({
    ...validPayload,
    relations: [{ ...validPayload.relations[0], provenance: { confidence: 101 } }],
  });
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /confidence must be between 0 and 100/);
  assert.equal(repository.relations.length, relationsBefore);
});

test("a method the route does not define is not found", async () => {
  const response = await fetch(importsUrl);
  assert.equal(response.status, 404);
});

test("any other path is not found", async () => {
  const response = await fetch(`${baseUrl}/nope`, { method: "POST" });
  assert.equal(response.status, 404);
});

test("a body that is not valid JSON is a 400 in JSON, not an HTML page", async () => {
  const response = await fetch(importsUrl, {
    method: "POST",
    headers: JSON_HEADERS,
    body: "{ not json",
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid JSON" });
});

test("a request with no JSON body is a 400", async () => {
  const response = await fetch(importsUrl, { method: "POST" });
  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /JSON body/);
});
