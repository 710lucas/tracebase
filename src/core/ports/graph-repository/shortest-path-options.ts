import { InvalidShortestPathOptionsError } from "./invalid-shortest-path-options-error.ts";

export const DEFAULT_SHORTEST_PATH_MAX_HOPS = 6;

// What a caller may choose about a shortest path besides the two entities: how many relations the path may
// have at most (`maxHops`). It is optional and has no upper limit, on purpose: the default is only what
// applies when the request says nothing, and the time limit (`QueryOptions`) is the safety net.
export interface ShortestPathOptions {
  readonly maxHops?: number;
}

export interface ResolvedShortestPathOptions {
  readonly maxHops: number;
}

// Fills in the default and checks the value: `maxHops` must be a whole number from 1. It is the one place
// that knows this rule, so every repository (memory, Memgraph) accepts and refuses the same values.
export function resolveShortestPathOptions(
  options: ShortestPathOptions = {},
): ResolvedShortestPathOptions {
  const maxHops = options.maxHops ?? DEFAULT_SHORTEST_PATH_MAX_HOPS;

  if (!Number.isSafeInteger(maxHops) || maxHops < 1) {
    throw new InvalidShortestPathOptionsError("maxHops must be a whole number from 1");
  }

  return { maxHops };
}
