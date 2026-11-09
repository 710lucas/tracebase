import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GraphRepository } from "../../core/ports/graph-repository/index.ts";
import { registerGetEntityDegreeTool } from "./tools/get-entity-degree.ts";

const SERVER_NAME = "tracebase";
const SERVER_VERSION = "0.1.0";

// Builds the MCP server with the tools the AI can call. The tools only read the graph, through the port.
// A server is built for each request (the transport is stateless), so nothing here is kept between calls.
export function createMcpServer(repository: GraphRepository): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  registerGetEntityDegreeTool(server, repository);

  return server;
}
