import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createEntity } from "../../../core/domain/entity/index.ts";
import type { GraphRepository } from "../../../core/ports/graph-repository/index.ts";
import { entityNotFound, runTool, toolAnswer } from "../tool-result.ts";
import { entityFields, timeLimitOf, timeoutMsField } from "./common-fields.ts";

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
      inputSchema: z.strictObject({ ...entityFields, timeoutMs: timeoutMsField }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ type, value, timeoutMs }) =>
      runTool(async () => {
        const degree = await repository.getEntityDegree(
          createEntity(type, value),
          timeLimitOf(timeoutMs),
        );

        return degree === null ? entityNotFound(type, value) : toolAnswer(degree);
      }),
  );
}
