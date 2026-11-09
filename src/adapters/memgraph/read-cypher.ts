import {
  createCypherRows,
  InvalidCypherError,
  resolveCypherReadOptions,
  type CypherReadOptions,
  type CypherRows,
} from "../../core/ports/cypher-reader/index.ts";
import {
  DEFAULT_QUERY_TIMEOUT_MS,
  type QueryOptions,
} from "../../core/ports/graph-repository/index.ts";
import { assertReadOnlyCypher } from "./cypher-guard.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";

// Reads with a statement the caller wrote (the plan B). Three layers, each enough against what the others
// cannot see: the guard refuses what is not ONE read statement (and `CALL`, `LOAD`); the statement is given a
// memory limit (`QUERY MEMORY LIMIT`) so one statement cannot use the memory of the server; and the connection
// runs it in a read transaction with the time limit, so the database itself refuses writes and administration.
//
// The statement is logged (its text only) before it runs: nobody reviews it before, and this is what is left
// to see what the AI asked.
export async function readCypher(
  connection: MemgraphConnection,
  statement: string,
  options: QueryOptions & CypherReadOptions = {},
): Promise<CypherRows> {
  const { maxRows, memoryLimitMb } = resolveCypherReadOptions(options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
  assertReadOnlyCypher(statement);

  // A new line before the limit, so a comment at the end of the statement does not swallow it.
  const limited = `${statement.trim().replace(/;$/, "")}\nQUERY MEMORY LIMIT ${memoryLimitMb}MB`;
  console.log(`cypher read: ${statement}`);

  try {
    const { columns, rows } = await connection.runReadOnly(limited, timeoutMs);

    return createCypherRows(columns, rows, maxRows);
  } catch (error) {
    throw asInvalidCypher(error, memoryLimitMb);
  }
}

// What Memgraph says when the statement is wrong (a syntax error, an unknown function, a write it refused) or
// uses too much memory is something the caller can fix by changing the statement or the option, so it becomes
// `InvalidCypherError` with the database's own words. A timeout and anything else go on as they are.
function asInvalidCypher(error: unknown, memoryLimitMb: number): unknown {
  if (!(error instanceof Error)) return error;

  if (error.message.includes("Memory limit exceeded")) {
    return new InvalidCypherError(
      `the statement needed more than ${memoryLimitMb} MB of memory; ask for less or pass a bigger memoryLimitMb`,
    );
  }
  if ((error as { code?: unknown }).code?.toString().startsWith("Memgraph.ClientError")) {
    return new InvalidCypherError(error.message);
  }

  return error;
}
