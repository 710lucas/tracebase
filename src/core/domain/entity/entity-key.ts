import type { Entity } from "./entity.ts";

// The identity of an entity as one string, for places that need to keep entities in a `Map` or a
// `Set`: two entities have the same key exactly when their type and value are equal. The NUL character
// separates the two parts because it cannot be part of the text of a type.
export function entityKey(entity: Entity): string {
  return `${entity.type}\u0000${entity.value}`;
}
