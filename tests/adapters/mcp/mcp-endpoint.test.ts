import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  QueryTimeoutError,
  type QueryOptions,
} from "../../../src/core/ports/graph-repository/index.ts";
import { startTestApp, textOf, type TestApp } from "./start-test-app.ts";

// `/mcp` and the tool `get_entity_degree`: the real app, called by a real MCP client over HTTP. The repository
// is wrapped to see the options of each call and to run out of time when the test says so.
const calls: (QueryOptions | undefined)[] = [];
let timesOut = false;
let app: TestApp;

before(async () => {
  app = await startTestApp((memory) => ({
    ...memory,
    getEntityDegree: async (entity, options) => {
      calls.push(options);
      if (timesOut) throw new QueryTimeoutError(options?.timeoutMs ?? 30_000);
      return memory.getEntityDegree(entity, options);
    },
  }));
});

after(async () => {
  await app.stop();
});

test("a client connects, and the server says its name", async () => {
  const client = await app.connect();

  assert.equal(client.getServerVersion()?.name, "tracebase");
  await client.close();
});

test("the server gives its instructions to the client, and they name every tool", async () => {
  const client = await app.connect();

  const instructions = client.getInstructions() ?? "";
  const { tools } = await client.listTools();

  assert.match(instructions, /OSINT knowledge graph/);
  assert.equal(tools.length, 7);
  for (const { name } of tools) {
    assert.ok(instructions.includes(name), `the instructions do not name ${name}`);
  }
  await client.close();
});

test("every tool has a title, a description and an input schema that closes the object", async () => {
  const client = await app.connect();

  const { tools } = await client.listTools();

  for (const tool of tools) {
    assert.ok(tool.title, `${tool.name} has no title`);
    assert.ok((tool.description ?? "").length > 80, `${tool.name} has a short description`);
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
  }
  await client.close();
});

test("the tools are listed with their description, their input and that they only read", async () => {
  const client = await app.connect();

  const { tools } = await client.listTools();
  const degree = tools.find(({ name }) => name === "get_entity_degree");

  assert.ok(degree);
  assert.match(degree.description ?? "", /How connected one entity is/);
  assert.deepEqual(Object.keys(degree.inputSchema.properties ?? {}).sort(), [
    "timeoutMs",
    "type",
    "value",
  ]);
  assert.deepEqual(degree.inputSchema.required, ["type", "value"]);
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
  }
  await client.close();
});

test("get_entity_degree answers the degree as JSON", async () => {
  const client = await app.connect();

  const result = await client.callTool({
    name: "get_entity_degree",
    arguments: { type: "IP_ADDRESS", value: "10.0.0.1" },
  });

  assert.notEqual(result.isError, true);
  assert.deepEqual(JSON.parse(textOf(result)), {
    entity: { type: "IP_ADDRESS", value: "10.0.0.1" },
    total: 2,
    incoming: 1,
    outgoing: 1,
    byNeighbourType: [{ type: "INTERNET_NAME", count: 2 }],
  });
  await client.close();
});

test("the time limit of the call is passed on, and none when it gives none", async () => {
  const client = await app.connect();
  calls.length = 0;

  await client.callTool({
    name: "get_entity_degree",
    arguments: { type: "IP_ADDRESS", value: "10.0.0.1" },
  });
  await client.callTool({
    name: "get_entity_degree",
    arguments: { type: "IP_ADDRESS", value: "10.0.0.1", timeoutMs: 1500 },
  });

  assert.deepEqual(calls, [{}, { timeoutMs: 1500 }]);
  await client.close();
});

test("an entity nothing mentions is an error that says so", async () => {
  const client = await app.connect();

  const result = await client.callTool({
    name: "get_entity_degree",
    arguments: { type: "IP_ADDRESS", value: "10.9.9.9" },
  });

  assert.equal(result.isError, true);
  assert.equal(textOf(result), "No entity of type IP_ADDRESS with value 10.9.9.9 is in the graph.");
  await client.close();
});

test("a blank type is an error that says what is wrong, not a crash", async () => {
  const client = await app.connect();

  const result = await client.callTool({
    name: "get_entity_degree",
    arguments: { type: "  ", value: "10.0.0.1" },
  });

  assert.equal(result.isError, true);
  assert.match(textOf(result), /type must not be blank/);
  await client.close();
});

test("an input of the wrong shape is refused by the protocol layer", async () => {
  const client = await app.connect();

  const result = await client.callTool({
    name: "get_entity_degree",
    arguments: { type: "IP_ADDRESS" },
  });

  assert.equal(result.isError, true);
  assert.match(textOf(result), /value/);
  await client.close();
});

test("a read that runs out of time is an error that tells the limit used", async () => {
  const client = await app.connect();
  timesOut = true;
  try {
    const result = await client.callTool({
      name: "get_entity_degree",
      arguments: { type: "IP_ADDRESS", value: "10.0.0.1", timeoutMs: 250 },
    });

    assert.equal(result.isError, true);
    assert.match(textOf(result), /the limit was 250 ms/);
  } finally {
    timesOut = false;
    await client.close();
  }
});

test("a body that is not JSON-RPC is answered with the protocol's error", async () => {
  const response = await fetch(`${app.baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: "{not json",
  });

  assert.equal(response.status, 400);
  assert.equal(((await response.json()) as { error: { code: number } }).error.code, -32700);
});

test("the other methods are not allowed, because the server keeps no session", async () => {
  for (const method of ["GET", "DELETE"]) {
    const response = await fetch(`${app.baseUrl}/mcp`, { method });

    assert.equal(response.status, 405);
    assert.equal(
      ((await response.json()) as { error: { message: string } }).error.message,
      "Method not allowed.",
    );
  }
});
