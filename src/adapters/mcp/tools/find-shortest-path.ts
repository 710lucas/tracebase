import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createEntity } from "../../../core/domain/entity/index.ts";
import {
  DEFAULT_SHORTEST_PATH_MAX_HOPS,
  type GraphRepository,
} from "../../../core/ports/graph-repository/index.ts";
import { runTool, toolAnswer, toolError } from "../tool-result.ts";
import { entityFields, timeLimitOf, timeoutMsField } from "./common-fields.ts";

// The tool that finds how two entities are linked. Both entities are built with `createEntity`, so the text is
// normalized as it was when they were imported.
export function registerFindShortestPathTool(server: McpServer, repository: GraphRepository): void {
  server.registerTool(
    "find_shortest_path",
    {
      title: "How two entities are linked",
      description:
        "The path with the fewest relations between two entities, walking the relations in either direction. The " +
        "answer lists the entities on the path and, for each step, ALL the relations between the two entities of " +
        "that step (each observation and each direction, with its provenance). Among paths of the same length the " +
        "answer is always the same one. If no path exists within maxHops the path is empty, which means only that " +
        "this graph does not show one, not that the entities are unrelated. Both entities must exist; if you do " +
        "not know their exact type and value, find them with search_entities first.",
      inputSchema: z.strictObject({
        from: z.strictObject(entityFields).describe("The entity where the path starts."),
        to: z.strictObject(entityFields).describe("The entity where the path ends."),
        maxHops: z
          .number()
          .int()
          .optional()
          .describe(
            `The most relations the path may have, from 1 (default ${DEFAULT_SHORTEST_PATH_MAX_HOPS}).`,
          ),
        timeoutMs: timeoutMsField,
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ from, to, maxHops, timeoutMs }) =>
      runTool(async () => {
        const start = createEntity(from.type, from.value);
        const end = createEntity(to.type, to.value);

        const path = await repository.getShortestPath(start, end, {
          ...(maxHops !== undefined && { maxHops }),
          ...timeLimitOf(timeoutMs),
        });
        if (path !== null) {
          return toolAnswer(path);
        }

        // Only on this error path: say which end is missing, so the AI knows what to fix.
        const missing: string[] = [];
        if ((await repository.findEntity(start)) === null) {
          missing.push(`the start (${start.type} ${start.value})`);
        }
        if ((await repository.findEntity(end)) === null) {
          missing.push(`the end (${end.type} ${end.value})`);
        }
        return toolError(`Not in the graph: ${missing.join(" and ")}.`);
      }),
  );
}
