import type { Entity } from "./entity.ts";
import { InvalidEntityError } from "./invalid-entity-error.ts";
import { normalizeEntityValue } from "./normalize-entity-value.ts";
import { normalizeText } from "../text/index.ts";

// The only supported way to build an Entity. It guarantees that every Entity in the system
// has a non-blank normalized type, a normalized non-blank value, and that it cannot be mutated
// afterwards.
//
// Type and value are normalized here, so identity (type + value) is decided in one place:
//   - the type gets the basic text hygiene (NFC + trim), so " DOMAIN_NAME" and "DOMAIN_NAME"
//     are the same type;
//   - the value gets `normalizeEntityValue`. Type-specific rules (case, trailing dot) are the
//     adapter's job.
//
// What this does NOT do:
//   - check that the type is a known one: types are owned by the tools (see `entity.ts`).
//
// SpiderFoot note: the adapter calls this once per event it decides to keep as an entity.
// If SpiderFoot ever emits an empty `data`, the adapter gets an InvalidEntityError and decides
// what to do (skip and log); the core never stores a blank node.
//
// EXPAND: a stable identity key built from (type, value), for the graph's uniqueness constraint.
export function createEntity(type: string, value: string): Entity {
  const normalizedType = normalizeText(type);
  if (normalizedType === "") {
    throw new InvalidEntityError("type must not be blank");
  }
  const normalizedValue = normalizeEntityValue(value);
  if (normalizedValue === "") {
    throw new InvalidEntityError("value must not be blank");
  }
  // The only cast of the brand: this is where the invariants were just checked.
  return Object.freeze({ type: normalizedType, value: normalizedValue }) as Entity;
}
