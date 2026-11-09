import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createEntity } from "../../../core/domain/entity/index.ts";
import {
  DEFAULT_NEIGHBOURHOOD_HOPS,
  DEFAULT_NEIGHBOURHOOD_MAX_ENTITIES,
  toLeanNeighbourhood,
  type GraphRepository,
} from "../../../core/ports/graph-repository/index.ts";
import { entityNotFound, runTool, toolAnswer } from "../tool-result.ts";
import { entityFields, timeLimitOf, timeoutMsField } from "./common-fields.ts";

// What is said to the AI when the answer is only one page of the neighbourhood: where the next page starts, or how
// to get all in one answer. It names the parameters of this tool, which is why it is written here and not in the
// core.
function moreEntitiesHint(nextOffset: number | undefined): string {
  return `More entities exist after this page: call again with offset=${nextOffset} for the next page, or with a bigger maxEntities and timeoutMs to get them in one answer.`;
}

// The tool that gives the entities within some relations of one entity. The answer is the lean shape of the core
// (the same as the REST route) unless the AI asks for `full`.
export function registerGetEntityNeighbourhoodTool(
  server: McpServer,
  repository: GraphRepository,
): void {
  server.registerTool(
    "get_entity_neighbourhood",
    {
      title: "Who is near an entity",
      description:
        `The entities within a number of relations of one entity (hops, default ${DEFAULT_NEIGHBOURHOOD_HOPS}), ` +
        "nearest first, and who is linked to whom. A relation has a direction, from a source to a target, and the " +
        `neighbourhood follows it in both ways. It is read by pages of maxEntities entities (default ` +
        `${DEFAULT_NEIGHBOURHOOD_MAX_ENTITIES}): when more exist the answer says truncated and gives nextOffset, ` +
        "which is the offset to ask for next. By default the answer is lean: the origin with its attributes, the " +
        "other entities as type, value and distance, and each relation as two ends without provenance; use " +
        "detail=full for the attributes of every entity and the provenance of every relation (much bigger). Look " +
        "at get_entity_degree first to know whether the entity is a large hub. It needs the exact type and value " +
        "of the entity; if you do not know them, find them with search_entities first.",
      inputSchema: z.strictObject({
        ...entityFields,
        hops: z
          .number()
          .int()
          .optional()
          .describe(
            `How many relations away to look, from 1 (default ${DEFAULT_NEIGHBOURHOOD_HOPS}).`,
          ),
        maxEntities: z
          .number()
          .int()
          .optional()
          .describe(
            `How many entities in a page, the origin included, from 1 (default ${DEFAULT_NEIGHBOURHOOD_MAX_ENTITIES}).`,
          ),
        offset: z
          .number()
          .int()
          .optional()
          .describe("How many entities to skip, from 0: the nextOffset of the previous page."),
        detail: z
          .enum(["lean", "full"])
          .optional()
          .describe("lean (default) or full, with the attributes and the provenance."),
        timeoutMs: timeoutMsField,
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ type, value, hops, maxEntities, offset, detail, timeoutMs }) =>
      runTool(async () => {
        const neighbourhood = await repository.getEntityNeighbourhood(createEntity(type, value), {
          ...(hops !== undefined && { hops }),
          ...(maxEntities !== undefined && { maxEntities }),
          ...(offset !== undefined && { offset }),
          ...timeLimitOf(timeoutMs),
        });
        if (neighbourhood === null) {
          return entityNotFound(type, value);
        }

        const answer = detail === "full" ? neighbourhood : toLeanNeighbourhood(neighbourhood);
        return toolAnswer(
          neighbourhood.truncated
            ? { ...answer, hint: moreEntitiesHint(neighbourhood.nextOffset) }
            : answer,
        );
      }),
  );
}
