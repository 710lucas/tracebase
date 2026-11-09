import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";
import type { GraphRepository } from "../../core/ports/graph-repository/index.ts";
import { createMcpServer } from "./create-mcp-server.ts";

// The JSON-RPC error codes the protocol uses for what is not a tool's own error.
const JSON_RPC_INTERNAL_ERROR = -32603;
const JSON_RPC_SERVER_ERROR = -32000;

// Controller of the MCP module: translates an HTTP request into a call to the MCP transport. It holds no rule
// about the graph.
//
// `handle`: the transport is stateless: each request builds its own server and transport and closes them when
// the response ends, so no session is kept. The body is left for the transport to read, which answers a body
// that is not JSON-RPC with the protocol's own error. A failure that is not the protocol's is a JSON-RPC
// internal error (500), as the SDK documents.
//
// `methodNotAllowed`: a stateless server has no stream to open (GET) and no session to close (DELETE).
export function createMcpController(repository: GraphRepository) {
  return {
    handle: async (request: Request, response: Response): Promise<void> => {
      const server = createMcpServer(repository);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      response.on("close", () => {
        void transport.close();
        void server.close();
      });

      try {
        await server.connect(transport);
        await transport.handleRequest(request, response);
      } catch (error) {
        console.error("MCP request failed", error);
        if (!response.headersSent) {
          response.status(constants.HTTP_STATUS_INTERNAL_SERVER_ERROR).json({
            jsonrpc: "2.0",
            error: { code: JSON_RPC_INTERNAL_ERROR, message: "Internal server error" },
            id: null,
          });
        }
      }
    },

    methodNotAllowed: (_request: Request, response: Response): void => {
      response.status(constants.HTTP_STATUS_METHOD_NOT_ALLOWED).json({
        jsonrpc: "2.0",
        error: { code: JSON_RPC_SERVER_ERROR, message: "Method not allowed." },
        id: null,
      });
    },
  };
}
