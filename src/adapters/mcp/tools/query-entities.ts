import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  DEFAULT_ENTITY_QUERY_LIMIT,
  DEFAULT_ENTITY_QUERY_SNIPPET_LENGTH,
  MATCH_MODES,
  QUERY_MODES,
  type EntityQuery,
  type GraphRepository,
} from "../../../core/ports/graph-repository/index.ts";
import { pageAnswer, runTool, toolAnswer } from "../tool-result.ts";
import { timeLimitOf, timeoutMsField } from "./common-fields.ts";

const matchField = z
  .enum(MATCH_MODES)
  .optional()
  .describe(
    "exact: the value is the text; contains: has the text inside, letter for letter; insensitive (default): has the text inside, ignoring case and accents.",
  );

// The tool for the questions the other tools cannot answer: counts, and a filter by type, by attribute and by
// who saw it. The query is the one of the core (`EntityQuery`); the core checks what the values mean.
export function registerQueryEntitiesTool(server: McpServer, repository: GraphRepository): void {
  server.registerTool(
    "query_entities",
    {
      title: "Filter or count the entities",
      description:
        "Finds, or counts, the entities that meet ALL the conditions you give (every field is optional; with none " +
        "it is the whole graph). Use it for what the other tools cannot do: how many entities there are of each " +
        "type (mode count with no conditions), only the entities of some types, entities that have an attribute " +
        "with a given name or value, entities that a given tool, module or run saw. Examples: how many IP " +
        '{"types":["IP_ADDRESS"],"mode":"count"}; web servers running nginx ' +
        '{"attributes":[{"name":"WEBSERVER_BANNER","text":"nginx"}]}; what the module sfp_dnsresolve found ' +
        '{"provenance":{"module":"sfp_dnsresolve"},"mode":"count"}. Count before you list: a list is read by ' +
        `pages of limit entities (default ${DEFAULT_ENTITY_QUERY_LIMIT}), ordered by value and then by type, and ` +
        "when more exist the answer says truncated and gives nextOffset. A list shows, for each attribute " +
        "condition that has a text, the snippet where it matched. Names of types and attributes come from the " +
        "tools that produced the data: see them with list_entity_types and search_entities.",
      inputSchema: z.strictObject({
        types: z
          .array(z.string())
          .optional()
          .describe(
            "The entity must have one of these types. Not empty: leave it out for any type.",
          ),
        value: z
          .strictObject({
            text: z.string().describe("The text, at least one character."),
            match: matchField,
          })
          .optional()
          .describe("A condition on the value of the entity."),
        attributes: z
          .array(
            z.strictObject({
              name: z.string().describe("The name of the attribute, for example WEBSERVER_BANNER."),
              qualifier: z
                .string()
                .optional()
                .describe("Narrows the attribute to one source or angle of it."),
              text: z
                .string()
                .optional()
                .describe(
                  "One of the values of the attribute must match this text. Without it the condition only asks that the entity has an attribute with that name.",
                ),
              match: matchField,
            }),
          )
          .optional()
          .describe("Conditions on the attributes of the entity; all must hold."),
        provenance: z
          .strictObject({
            tool: z.string().optional(),
            module: z.string().optional(),
            run: z.string().optional(),
          })
          .optional()
          .describe(
            "The entity must have a relation or an attribute seen by this tool, module or run. At least one of the three; when you give several, ALL of them must be on the same observation.",
          ),
        includeHistory: z
          .boolean()
          .optional()
          .describe(
            "Also look at the attribute sets that a newer one replaced (default false); the matches from them are marked history.",
          ),
        mode: z
          .enum(QUERY_MODES)
          .optional()
          .describe(
            "list (default): a page of entities; count: only the total and the count by type.",
          ),
        limit: z
          .number()
          .int()
          .optional()
          .describe(
            `How many entities in a page, from 1 (default ${DEFAULT_ENTITY_QUERY_LIMIT}); ignored by count.`,
          ),
        offset: z
          .number()
          .int()
          .optional()
          .describe(
            "How many entities to skip, from 0: the nextOffset of the previous page; ignored by count.",
          ),
        snippetLength: z
          .number()
          .int()
          .optional()
          .describe(
            `How many characters of a value are shown around the text, from 1 (default ${DEFAULT_ENTITY_QUERY_SNIPPET_LENGTH}).`,
          ),
        timeoutMs: timeoutMsField,
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ timeoutMs, ...query }) =>
      runTool(async () => {
        // A field the AI did not send is absent from `query`, which is what the optional fields of
        // `EntityQuery` mean.
        const answer = await repository.queryEntities(query as EntityQuery, timeLimitOf(timeoutMs));

        return answer.mode === "list" ? pageAnswer(answer) : toolAnswer(answer);
      }),
  );
}
