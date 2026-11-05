import { compareText } from "../text/index.ts";
import type { Entity } from "./entity.ts";

// The order of entities whenever the answer of a question has to come in a fixed order: by type, then by
// value. The text is compared character by character, not with the language-aware order of
// `localeCompare`: a database sorts text this way, so a repository that lets its database pick the first
// entity (or the nearest ones) chooses the same as one that sorts in memory.
export function compareEntities(first: Entity, second: Entity): number {
  return compareText(first.type, second.type) || compareText(first.value, second.value);
}

// The other fixed order, for a list that is read by value, such as the results of a search: by value first,
// then by type when two entities have the same value.
export function compareEntitiesByValue(first: Entity, second: Entity): number {
  return compareText(first.value, second.value) || compareText(first.type, second.type);
}
