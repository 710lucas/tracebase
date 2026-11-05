import type { Entity } from "./entity.ts";

// The order of entities whenever the answer of a question has to come in a fixed order: by type, then by
// value. The text is compared character by character, not with the language-aware order of
// `localeCompare`: a database sorts text this way, so a repository that lets its database pick the first
// entity (or the nearest ones) chooses the same as one that sorts in memory.
export function compareEntities(first: Entity, second: Entity): number {
  return compareText(first.type, second.type) || compareText(first.value, second.value);
}

function compareText(first: string, second: string): number {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}
