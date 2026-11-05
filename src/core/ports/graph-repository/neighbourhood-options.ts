import { InvalidNeighbourhoodOptionsError } from "./invalid-neighbourhood-options-error.ts";

export const DEFAULT_NEIGHBOURHOOD_HOPS = 3;
export const DEFAULT_NEIGHBOURHOOD_MAX_ENTITIES = 100;

// What a caller may choose about a neighbourhood besides the entity: how far to go (`hops`, the number
// of relations between the entity and the farthest one reached) and how many entities to return at
// most, the entity itself included (`maxEntities`). Both are optional; neither has an upper limit, on
// purpose: the caller chooses how much to ask, and the time limit (`QueryOptions`) is the safety net.
export interface NeighbourhoodOptions {
  readonly hops?: number;
  readonly maxEntities?: number;
}

export interface ResolvedNeighbourhoodOptions {
  readonly hops: number;
  readonly maxEntities: number;
}

// Fills in the defaults and checks the values: both must be whole numbers from 1. It is the one place
// that knows these rules, so every repository (memory, Memgraph) accepts and refuses the same values.
export function resolveNeighbourhoodOptions(
  options: NeighbourhoodOptions = {},
): ResolvedNeighbourhoodOptions {
  const hops = options.hops ?? DEFAULT_NEIGHBOURHOOD_HOPS;
  const maxEntities = options.maxEntities ?? DEFAULT_NEIGHBOURHOOD_MAX_ENTITIES;

  if (!isWholeNumberFromOne(hops)) {
    throw new InvalidNeighbourhoodOptionsError("hops must be a whole number from 1");
  }
  if (!isWholeNumberFromOne(maxEntities)) {
    throw new InvalidNeighbourhoodOptionsError("maxEntities must be a whole number from 1");
  }

  return { hops, maxEntities };
}

function isWholeNumberFromOne(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}
