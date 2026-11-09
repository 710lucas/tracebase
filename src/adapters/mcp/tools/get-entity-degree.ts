import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createEntity } from "../../../core/domain/entity/index.ts";
import type { GraphRepository } from "../../../core/ports/graph-repository/index.ts";
import { runTool, toolAnswer, toolError } from "../tool-result.ts";

// The tool that says how connected one entity is. The entity is built with `createEntity`, so the text is
// normalized as it was when the entity was imported. An entity nothing mentions is an error the AI can read.
export function registerGetEntityDegreeTool(server: McpServer, repository: GraphRepository): void {
  server.registerTool(
    "get_entity_degree",
    {
      title: "How connected an entity is",
      description:
        "How connected one entity is: the total number of relations, how many arrive and how many leave, and how " +
        "many go to each type of neighbour. It is cheap, so use it before get_entity_neighbourhood to see whether " +
        "an entity is a large hub. It needs the exact type and value of the entity; if you do not know them, " +
        "find them with search_entities first.",
      inputSchema: {
        type: z.string().describe("The entity type, for example IP_ADDRESS or INTERNET_NAME."),
        value: z.string().describe("The entity value, for example 104.21.2.94."),
        timeoutMs: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("How long the read may take, in milliseconds (default 30000)."),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ type, value, timeoutMs }) =>
      runTool(async () => {
        const degree = await repository.getEntityDegree(createEntity(type, value), {
          ...(timeoutMs !== undefined && { timeoutMs }),
        });

        return degree === null
          ? toolError(`No entity of type ${type} with value ${value} is in the graph.`)
          : toolAnswer(degree);
      }),
  );
}
