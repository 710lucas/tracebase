import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GraphRepository } from "../../../core/ports/graph-repository/index.ts";
import { runTool, toolAnswer } from "../tool-result.ts";

// The tool that lists the entity types with how many entities each has. It takes no input.
export function registerListEntityTypesTool(server: McpServer, repository: GraphRepository): void {
  server.registerTool(
    "list_entity_types",
    {
      title: "The entity types in the graph",
      description:
        "The entity types the graph has, each with how many entities it holds, the biggest first. The types come " +
        "from the tools that produced the data, so there is no fixed list: start here to know what exists before " +
        "you search, and use the exact names it gives in the other tools.",
      inputSchema: z.strictObject({}),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    () => runTool(async () => toolAnswer({ types: await repository.listEntityTypes() })),
  );
}
