import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CypherReader } from "../../core/ports/cypher-reader/index.ts";
import type { GraphRepository } from "../../core/ports/graph-repository/index.ts";
import { SERVER_INSTRUCTIONS, SERVER_INSTRUCTIONS_WITH_CYPHER } from "./server-instructions.ts";
import { registerRunReadOnlyCypherTool } from "./tools/run-read-only-cypher.ts";
import { registerFindEntityTool } from "./tools/find-entity.ts";
import { registerFindShortestPathTool } from "./tools/find-shortest-path.ts";
import { registerQueryEntitiesTool } from "./tools/query-entities.ts";
import { registerSearchEntitiesTool } from "./tools/search-entities.ts";
import { registerGetEntityDegreeTool } from "./tools/get-entity-degree.ts";
import { registerGetEntityNeighbourhoodTool } from "./tools/get-entity-neighbourhood.ts";
import { registerListEntityTypesTool } from "./tools/list-entity-types.ts";

const SERVER_NAME = "tracebase";
const SERVER_VERSION = "0.1.0";

// Builds the MCP server with the tools the AI can call. The tools only read the graph, through the ports.
// A server is built for each request (the transport is stateless), so nothing here is kept between calls.
// The Cypher tool exists only when a `CypherReader` is given (the store is Memgraph), and then the
// instructions tell the AI about it.
export function createMcpServer(
  repository: GraphRepository,
  cypherReader?: CypherReader,
): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        cypherReader === undefined ? SERVER_INSTRUCTIONS : SERVER_INSTRUCTIONS_WITH_CYPHER,
    },
  );

  registerListEntityTypesTool(server, repository);
  registerFindEntityTool(server, repository);
  registerGetEntityDegreeTool(server, repository);
  registerGetEntityNeighbourhoodTool(server, repository);
  registerFindShortestPathTool(server, repository);
  registerSearchEntitiesTool(server, repository);
  registerQueryEntitiesTool(server, repository);
  if (cypherReader !== undefined) registerRunReadOnlyCypherTool(server, cypherReader);

  return server;
}
