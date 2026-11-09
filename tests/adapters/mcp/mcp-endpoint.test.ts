import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../../../src/adapters/http/index.ts";
import { createInMemoryGraphRepository } from "../../../src/adapters/memory/in-memory-graph-repository.ts";
import {
  QueryTimeoutError,
  type GraphRepository,
  type QueryOptions,
} from "../../../src/core/ports/graph-repository/index.ts";

// `/mcp`: the real app over the in-memory repository, called by a real MCP client over HTTP, as an AI client
// would. The repository can be made to run out of time, to see what the tool answers then.
const calls: (QueryOptions | undefined)[] = [];
let timesOut = false;
let runningServer: Server;
let baseUrl: string;

before(async () => {
  const silencedLog = mock.method(console, "log", () => {});
  const memory = createInMemoryGraphRepository();
  const graphRepository: GraphRepository = {
    ...memory,
    getEntityDegree: async (entity, options) => {
      calls.push(options);
      if (timesOut) throw new QueryTimeoutError(options?.timeoutMs ?? 30_000);
      return memory.getEntityDegree(entity, options);
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
          source: { type: "IP_ADDRESS", value: "10.0.0.1" },
          target: { type: "INTERNET_NAME", value: "a.example.com" },
        },
        {
          source: { type: "INTERNET_NAME", value: "b.example.com" },
          target: { type: "IP_ADDRESS", value: "10.0.0.1" },
        },
      ],
      attributes: [],
    }),
  });
  silencedLog.mock.restore();
});

after(async () => {
  await new Promise((resolve) => runningServer.close(resolve));
});

async function connectedClient(): Promise<Client> {
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
  return client;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const [first] = result.content as { type: string; text: string }[];
  return first?.text ?? "";
}

test("a client connects, and the server says its name", async () => {
  const client = await connectedClient();

  assert.equal(client.getServerVersion()?.name, "tracebase");
  await client.close();
});

test("the tools are listed with their description, their input and that they only read", async () => {
  const client = await connectedClient();

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
  assert.equal(degree.annotations?.readOnlyHint, true);
  await client.close();
});

test("get_entity_degree answers the degree as JSON", async () => {
  const client = await connectedClient();

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
  const client = await connectedClient();
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
  const client = await connectedClient();

  const result = await client.callTool({
    name: "get_entity_degree",
    arguments: { type: "IP_ADDRESS", value: "10.9.9.9" },
  });

  assert.equal(result.isError, true);
  assert.equal(textOf(result), "No entity of type IP_ADDRESS with value 10.9.9.9 is in the graph.");
  await client.close();
});

test("a blank type is an error that says what is wrong, not a crash", async () => {
  const client = await connectedClient();

  const result = await client.callTool({
    name: "get_entity_degree",
    arguments: { type: "  ", value: "10.0.0.1" },
  });

  assert.equal(result.isError, true);
  assert.match(textOf(result), /type must not be blank/);
  await client.close();
});

test("an input of the wrong shape is refused by the protocol layer", async () => {
  const client = await connectedClient();

  const result = await client.callTool({
    name: "get_entity_degree",
    arguments: { type: "IP_ADDRESS" },
  });

  assert.equal(result.isError, true);
  assert.match(textOf(result), /value/);
  await client.close();
});

test("a read that runs out of time is an error that tells the limit used", async () => {
  const client = await connectedClient();
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
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: "{not json",
  });

  assert.equal(response.status, 400);
  assert.equal(((await response.json()) as { error: { code: number } }).error.code, -32700);
});

test("the other methods are not allowed, because the server keeps no session", async () => {
  for (const method of ["GET", "DELETE"]) {
    const response = await fetch(`${baseUrl}/mcp`, { method });

    assert.equal(response.status, 405);
    assert.equal(
      ((await response.json()) as { error: { message: string } }).error.message,
      "Method not allowed.",
    );
  }
});
