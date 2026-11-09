import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  DEFAULT_CYPHER_MAX_ROWS,
  DEFAULT_CYPHER_MEMORY_LIMIT_MB,
  type CypherReader,
} from "../../../core/ports/cypher-reader/index.ts";
import { runTool, toolAnswer } from "../tool-result.ts";
import { timeLimitOf, timeoutMsField } from "./common-fields.ts";

// The tool of last resort: the AI writes the Cypher itself. It exists only when the store can answer Cypher
// (Memgraph). The adapter makes it safe (see `read-cypher.ts`); this file only describes it to the AI and passes
// the call on.
export function registerRunReadOnlyCypherTool(server: McpServer, reader: CypherReader): void {
  server.registerTool(
    "run_read_only_cypher",
    {
      title: "Run a read-only Cypher statement",
      description:
        "Runs a Cypher statement that you write, only when none of the other tools can answer the question " +
        "(for example a pattern of several relations, or an aggregation they do not offer). Try the other tools " +
        "first. The statement must be ONE reading statement that starts with MATCH, OPTIONAL MATCH, WITH, UNWIND " +
        "or RETURN; CREATE, MERGE, SET, DELETE, REMOVE, CALL and LOAD are refused. The graph: entities are " +
        "nodes `(:Entity {type, value})`, relations are edges between them (no relation type: any type of edge " +
        "except HAS_ATTRIBUTE), the current attributes are in the map `n.attributes[name][qualifier]` and the " +
        "replaced ones are `(:Attribute)` nodes linked by HAS_ATTRIBUTE; provenance (tool, module, run) is on " +
        "the edges and on the attribute sets. Always put a LIMIT or an aggregation: a statement that returns " +
        `everything is cut at maxRows (default ${DEFAULT_CYPHER_MAX_ROWS}) after it has run. Nodes come back as ` +
        "{labels, properties}, relations as {type, properties}. A statement that uses more memory than " +
        `memoryLimitMb (default ${DEFAULT_CYPHER_MEMORY_LIMIT_MB}) or more time than timeoutMs fails, and the error ` +
        "says what to change. Every statement is logged by the server.",
      inputSchema: z.strictObject({
        statement: z.string().describe("The Cypher statement, one reading statement."),
        maxRows: z
          .number()
          .int()
          .optional()
          .describe(
            `How many rows to return at most, from 1 (default ${DEFAULT_CYPHER_MAX_ROWS}); when more exist the answer says truncated and gives totalRows.`,
          ),
        memoryLimitMb: z
          .number()
          .int()
          .optional()
          .describe(
            `How much memory the statement may use, in megabytes, from 1 (default ${DEFAULT_CYPHER_MEMORY_LIMIT_MB}).`,
          ),
        timeoutMs: timeoutMsField,
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ statement, maxRows, memoryLimitMb, timeoutMs }) =>
      runTool(async () => {
        const answer = await reader.readCypher(statement, {
          ...timeLimitOf(timeoutMs),
          ...(maxRows !== undefined && { maxRows }),
          ...(memoryLimitMb !== undefined && { memoryLimitMb }),
        });

        return toolAnswer(
          answer.truncated
            ? {
                ...answer,
                hint: `The statement produced ${answer.totalRows} rows and only the first ${answer.rows.length} are here: add a LIMIT or an aggregation to the statement, or pass a bigger maxRows.`,
              }
            : answer,
        );
      }),
  );
}
