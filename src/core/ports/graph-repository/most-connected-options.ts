import { InvalidMostConnectedError } from "./invalid-most-connected-error.ts";

export const DEFAULT_MOST_CONNECTED_LIMIT = 10;

// What a caller may choose about the question "which entities are the most connected": how many to list
// (`limit`). It is optional and has no upper limit, on purpose: the default is only what applies when the
// request says nothing, and the time limit (`QueryOptions`) is the safety net.
export interface MostConnectedOptions {
  readonly limit?: number;
}

export interface ResolvedMostConnectedOptions {
  readonly limit: number;
}

// Fills in the default and checks the value: `limit` must be a whole number from 1. It is the one place that
// knows this rule, so every repository (memory, Memgraph) accepts and refuses the same values.
export function resolveMostConnectedOptions(
  options: MostConnectedOptions = {},
): ResolvedMostConnectedOptions {
  const limit = options.limit ?? DEFAULT_MOST_CONNECTED_LIMIT;

  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new InvalidMostConnectedError("limit must be a whole number from 1");
  }

  return { limit };
}
