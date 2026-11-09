import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createEntity } from "../../../core/domain/entity/index.ts";
import type { GraphRepository } from "../../../core/ports/graph-repository/index.ts";
import { entityNotFound, runTool, toolAnswer } from "../tool-result.ts";
import { entityFields } from "./common-fields.ts";

// The tool that gives everything the graph holds about one entity. The entity is built with `createEntity`, so
// the text is normalized as it was when the entity was imported.
export function registerFindEntityTool(server: McpServer, repository: GraphRepository): void {
  server.registerTool(
    "find_entity",
    {
      title: "Everything the graph holds about an entity",
      description:
        "Everything the graph holds about one entity: every relation it takes part in (each with where it came " +
        "from: tool, run, module, confidence) and its current attributes (each with its provenance). The answer " +
        "can be very large for an entity with many relations, so look at get_entity_degree first, and prefer " +
        "get_entity_neighbourhood to see who is near it. It needs the exact type and value of the entity; if you " +
        "do not know them, find them with search_entities first.",
      inputSchema: z.strictObject(entityFields),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ type, value }) =>
      runTool(async () => {
        const findings = await repository.findEntity(createEntity(type, value));

        return findings === null ? entityNotFound(type, value) : toolAnswer(findings);
      }),
  );
}
