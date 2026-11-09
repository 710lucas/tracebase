import { InvalidCypherError } from "./invalid-cypher-error.ts";

export const DEFAULT_CYPHER_MAX_ROWS = 100;
export const DEFAULT_CYPHER_MEMORY_LIMIT_MB = 256;

// What a caller may choose about reading a Cypher statement, besides the time limit (`QueryOptions.timeoutMs`):
// how many rows are returned at most (`maxRows`) and how much memory the statement may use (`memoryLimitMb`).
// Both are optional and neither has an upper limit, on purpose: the defaults are only what applies when the
// request says nothing, and the time and memory limits are the safety net.
export interface CypherReadOptions {
  readonly maxRows?: number;
  readonly memoryLimitMb?: number;
}

export interface ResolvedCypherReadOptions {
  readonly maxRows: number;
  readonly memoryLimitMb: number;
}

// Fills in the defaults and checks the values: both must be whole numbers from 1. It is the one place that knows
// this rule.
export function resolveCypherReadOptions(
  options: CypherReadOptions = {},
): ResolvedCypherReadOptions {
  const maxRows = options.maxRows ?? DEFAULT_CYPHER_MAX_ROWS;
  const memoryLimitMb = options.memoryLimitMb ?? DEFAULT_CYPHER_MEMORY_LIMIT_MB;

  if (!Number.isSafeInteger(maxRows) || maxRows < 1) {
    throw new InvalidCypherError("maxRows must be a whole number from 1");
  }
  if (!Number.isSafeInteger(memoryLimitMb) || memoryLimitMb < 1) {
    throw new InvalidCypherError("memoryLimitMb must be a whole number from 1");
  }

  return { maxRows, memoryLimitMb };
}
