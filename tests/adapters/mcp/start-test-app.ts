import { mock } from "node:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../../../src/adapters/http/index.ts";
import { createInMemoryGraphRepository } from "../../../src/adapters/memory/in-memory-graph-repository.ts";
import type { GraphRepository } from "../../../src/core/ports/graph-repository/index.ts";

// The app the MCP tests call: the real application over the in-memory repository, with a small graph already
// imported, and a real MCP client that talks to it over HTTP, as an AI client would. A test can wrap the
// repository to see the calls or to make a read fail.
//
// The graph: 10.0.0.1 -> a.example.com, and b.example.com -> 10.0.0.1 (seen by the module `sfp_dns`); the
// address has a web server banner.
export interface TestApp {
  readonly baseUrl: string;
  connect(): Promise<Client>;
  stop(): Promise<void>;
}

export async function startTestApp(
  wrap: (memory: GraphRepository) => GraphRepository = (memory) => memory,
): Promise<TestApp> {
  const graphRepository = wrap(createInMemoryGraphRepository());
  let runningServer: Server | undefined;
  await new Promise<void>((resolve) => {
    runningServer = createApp({ graphRepository, runtimeInfo: { storage: "memory" } }).listen(
      0,
      () => resolve(),
    );
  });
  const baseUrl = `http://localhost:${((runningServer as Server).address() as AddressInfo).port}`;

  // The import route logs what it saves; the import below is on purpose, so the log is silenced.
  const silencedLog = mock.method(console, "log", () => {});
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
          provenance: { module: "sfp_dns" },
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

  return {
    baseUrl,
    connect: async () => {
      const client = new Client({ name: "test-client", version: "1.0.0" });
      await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
      return client;
    },
    stop: () => new Promise((resolve) => (runningServer as Server).close(() => resolve())),
  };
}

// The text of the first content of what a tool answered.
export function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const [first] = result.content as { type: string; text: string }[];
  return first?.text ?? "";
}
