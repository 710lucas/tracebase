import { InvalidNeighbourhoodOptionsError } from "./invalid-neighbourhood-options-error.ts";

export const DEFAULT_NEIGHBOURHOOD_HOPS = 3;
export const DEFAULT_NEIGHBOURHOOD_MAX_ENTITIES = 200;
export const DEFAULT_NEIGHBOURHOOD_OFFSET = 0;

// What a caller may choose about a neighbourhood besides the entity: how far to go (`hops`, the number
// of relations between the entity and the farthest one reached) and how many entities to return at
// most, the entity itself included (`maxEntities`, which is also the size of a page), and how many
// entities to skip from the start of the ordered list (`offset`), to read a big neighbourhood page by page.
// All are optional; none has an upper limit, on purpose: the caller chooses how much to ask, and the time
// limit (`QueryOptions`) is the safety net.
export interface NeighbourhoodOptions {
  readonly hops?: number;
  readonly maxEntities?: number;
  readonly offset?: number;
}

export interface ResolvedNeighbourhoodOptions {
  readonly hops: number;
  readonly maxEntities: number;
  readonly offset: number;
}

// Fills in the defaults and checks the values: `hops` and `maxEntities` must be whole numbers from 1 and
// `offset` a whole number from 0. It is the one place
// that knows these rules, so every repository (memory, Memgraph) accepts and refuses the same values.
export function resolveNeighbourhoodOptions(
  options: NeighbourhoodOptions = {},
): ResolvedNeighbourhoodOptions {
  const hops = options.hops ?? DEFAULT_NEIGHBOURHOOD_HOPS;
  const maxEntities = options.maxEntities ?? DEFAULT_NEIGHBOURHOOD_MAX_ENTITIES;
  const offset = options.offset ?? DEFAULT_NEIGHBOURHOOD_OFFSET;

  if (!isWholeNumberFromOne(hops)) {
    throw new InvalidNeighbourhoodOptionsError("hops must be a whole number from 1");
  }
  if (!isWholeNumberFromOne(maxEntities)) {
    throw new InvalidNeighbourhoodOptionsError("maxEntities must be a whole number from 1");
  }

  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new InvalidNeighbourhoodOptionsError("offset must be a whole number from 0");
  }

  return { hops, maxEntities, offset };
}

function isWholeNumberFromOne(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}
