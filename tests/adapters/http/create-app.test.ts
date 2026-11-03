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
    runningServer = createApp({
      graphRepository: repository,
      runtimeInfo: { storage: "memory" },
    }).listen(0, () => resolve());
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
  attributes: [{ entity: ipAddress, name: "WEBSERVER_BANNER", values: ["nginx/1.25"] }],
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

test("an accepted payload is stamped with the time it was received", async () => {
  const before = Date.now();

  await postImportPayload({ ...validPayload, source: { tool: "spiderfoot", run: "stamped-run" } });

  const recordedAt = repository.relations.at(-1)?.provenance.recordedAt as number;
  assert.ok(recordedAt >= before && recordedAt <= Date.now());
});

test("a tool cannot send recordedAt: that time is ours", async () => {
  const response = await postImportPayload({
    ...validPayload,
    attributes: [
      {
        entity: ipAddress,
        name: "WEBSERVER_BANNER",
        values: ["nginx/1.25"],
        provenance: { recordedAt: 1 },
      },
    ],
  });

  assert.equal(response.status, 400);
});

test("a failure of the repository is a 500, not a lost request", async () => {
  const failingRepository = {
    ...createInMemoryGraphRepository(),
    save: async () => {
      throw new Error("storage is down");
    },
  };
  const failingApp = createApp({
    graphRepository: failingRepository,
    runtimeInfo: { storage: "memory" },
  });
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
    attributes: [{ entity: ipAddress, name: "n", values: ["v"], provenance: { confidance: 5 } }],
  });
  assert.equal(response.status, 400);
});

test("a value the domain rejects is a 400 with the domain's reason and the item it was in", async () => {
  const relationsBefore = repository.relations.length;
  const response = await postImportPayload({
    ...validPayload,
    relations: [{ ...validPayload.relations[0], provenance: { confidence: 101 } }],
  });
  assert.equal(response.status, 400);
  const body = (await response.json()) as {
    error: string;
    issues: { path: string; message: string }[];
  };
  assert.equal(body.error, "invalid payload");
  assert.equal(body.issues.length, 1);
  assert.equal(body.issues[0]?.path, "relations.0");
  assert.match(body.issues[0]?.message ?? "", /confidence must be between 0 and 100/);
  assert.equal(repository.relations.length, relationsBefore);
});

test("the answer points at the bad item among many, and nothing of the batch is saved", async () => {
  const attributesBefore = repository.attributes.length;
  const response = await postImportPayload({
    ...validPayload,
    attributes: [
      { entity: ipAddress, name: "a", values: ["x"] },
      { entity: ipAddress, name: "b", values: ["y"] },
      { entity: ipAddress, name: "c", values: ["ok", "  "] },
    ],
  });
  const body = (await response.json()) as { issues: { path: string; message: string }[] };

  assert.equal(response.status, 400);
  assert.deepEqual(body.issues, [
    { path: "attributes.2", message: "Invalid attribute: a value must not be blank" },
  ]);
  assert.equal(repository.attributes.length, attributesBefore);
});

test("a method the route does not define is not found", async () => {
  const response = await fetch(importsUrl, { method: "DELETE" });
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

test("an attribute still sent with the old `value` field is a 400, not a silent loss", async () => {
  const response = await fetch(importsUrl, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      ...validPayload,
      attributes: [{ entity: ipAddress, name: "WEBSERVER_BANNER", value: "nginx/1.25" }],
    }),
  });

  assert.equal(response.status, 400);
});

test("an attribute with no values or a blank value is a 400 that says why", async () => {
  for (const [values, reason] of [
    [[], "values must not be empty"],
    [[" "], "a value must not be blank"],
  ] as const) {
    const response = await fetch(importsUrl, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        ...validPayload,
        attributes: [{ entity: ipAddress, name: "WEBSERVER_BANNER", values }],
      }),
    });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { issues: { path: string; message: string }[] };
    assert.equal(body.issues[0]?.path, "attributes.0");
    assert.match(body.issues[0]?.message ?? "", new RegExp(reason));
  }
});

test("an attribute with several values is accepted as one", async () => {
  const response = await fetch(importsUrl, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      ...validPayload,
      attributes: [
        { entity: ipAddress, name: "WEBSERVER_STRANGEHEADER", values: ["x-a: 1", "x-b: 2"] },
      ],
    }),
  });

  assert.equal(response.status, 202);
  assert.deepEqual((await response.json()) as object, {
    status: "accepted",
    relations: 1,
    attributes: 1,
  });
});

test("an attribute qualifier is accepted and reaches the repository", async () => {
  const attributesBefore = repository.attributes.length;

  const response = await postImportPayload({
    ...validPayload,
    attributes: [
      { entity: ipAddress, name: "MALICIOUS_SUBNET", qualifier: "sfp_cinsscore", values: ["x"] },
    ],
  });

  assert.equal(response.status, 202);
  assert.equal(repository.attributes.length, attributesBefore + 1);
  assert.equal(repository.attributes.at(-1)?.qualifier, "sfp_cinsscore");
});

test("a blank qualifier is refused with a 400", async () => {
  const response = await postImportPayload({
    ...validPayload,
    attributes: [{ entity: ipAddress, name: "n", qualifier: " ", values: ["x"] }],
  });

  assert.equal(response.status, 400);
});

test("the recordRefs of an item reach the repository, sorted and without repeats", async () => {
  const response = await postImportPayload({
    ...validPayload,
    attributes: [
      {
        entity: ipAddress,
        name: "n",
        values: ["v"],
        provenance: { recordRefs: ["b", "a", "b"] },
      },
    ],
  });

  assert.equal(response.status, 202);
  assert.deepEqual(repository.attributes.at(-1)?.provenance.recordRefs, ["a", "b"]);
});

test("the old single recordRef field is refused with a 400", async () => {
  const response = await postImportPayload({
    ...validPayload,
    attributes: [
      { entity: ipAddress, name: "n", values: ["v"], provenance: { recordRef: "hashA" } },
    ],
  });

  assert.equal(response.status, 400);
});

test("a blank recordRefs entry is refused with a 400", async () => {
  const response = await postImportPayload({
    ...validPayload,
    attributes: [
      { entity: ipAddress, name: "n", values: ["v"], provenance: { recordRefs: [" "] } },
    ],
  });

  assert.equal(response.status, 400);
});
