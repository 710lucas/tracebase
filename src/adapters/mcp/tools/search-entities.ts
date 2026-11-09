import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_SEARCH_MAX_MATCHES,
  DEFAULT_SEARCH_SNIPPET_LENGTH,
  MATCH_MODES,
  SEARCH_SCOPES,
  type GraphRepository,
} from "../../../core/ports/graph-repository/index.ts";
import { pageAnswer, runTool } from "../tool-result.ts";
import { timeLimitOf, timeoutMsField } from "./common-fields.ts";

// The tool that finds the entities that contain a text. The text and the options are checked by the core.
export function registerSearchEntitiesTool(server: McpServer, repository: GraphRepository): void {
  server.registerTool(
    "search_entities",
    {
      title: "Search the graph for a text",
      description:
        "Finds the entities whose value, or (scope full, the default) whose current attribute values, contain a " +
        "text. The text is literal: a dot is a dot, there are no wildcards. By default case and accents are " +
        "ignored (match insensitive: cafe finds Café); contains respects case and accents, and exact asks for a " +
        "value that is the whole text. Entities whose value matches come first, then the ones that match only in " +
        "an attribute, each by value; every result says where it matched, with a snippet. It is read by pages of " +
        `limit entities (default ${DEFAULT_SEARCH_LIMIT}): when more exist the answer says truncated and gives ` +
        "nextOffset. Use it to find the exact type and value of an entity for the other tools. To filter by type, " +
        "attribute name or who saw it, use query_entities.",
      inputSchema: z.strictObject({
        text: z.string().describe("The text to look for, at least one character."),
        scope: z
          .enum(SEARCH_SCOPES)
          .optional()
          .describe(
            "entity-value looks only at the value of the entities (cheap); full (default) also looks at the values of their attributes.",
          ),
        match: z
          .enum(MATCH_MODES)
          .optional()
          .describe(
            "exact: the value is the text; contains: has the text inside, letter for letter; insensitive (default): has the text inside, ignoring case and accents.",
          ),
        limit: z
          .number()
          .int()
          .optional()
          .describe(`How many entities in a page, from 1 (default ${DEFAULT_SEARCH_LIMIT}).`),
        offset: z
          .number()
          .int()
          .optional()
          .describe("How many entities to skip, from 0: the nextOffset of the previous page."),
        maxMatches: z
          .number()
          .int()
          .optional()
          .describe(
            `How many places an entity lists where the text was found, from 1 (default ${DEFAULT_SEARCH_MAX_MATCHES}).`,
          ),
        snippetLength: z
          .number()
          .int()
          .optional()
          .describe(
            `How many characters of a value are shown around the text, from 1 (default ${DEFAULT_SEARCH_SNIPPET_LENGTH}).`,
          ),
        timeoutMs: timeoutMsField,
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ text, scope, match, limit, offset, maxMatches, snippetLength, timeoutMs }) =>
      runTool(async () =>
        pageAnswer(
          await repository.searchEntities(text, {
            ...(scope !== undefined && { scope }),
            ...(match !== undefined && { match }),
            ...(limit !== undefined && { limit }),
            ...(offset !== undefined && { offset }),
            ...(maxMatches !== undefined && { maxMatches }),
            ...(snippetLength !== undefined && { snippetLength }),
            ...timeLimitOf(timeoutMs),
          }),
        ),
      ),
  );
}
