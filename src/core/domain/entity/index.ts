// Public API of the `entity` module. Code outside this folder imports only from here,
// never from the individual files, so the inside can be reorganized freely.
export type { Entity } from "./entity.ts";
export { createEntity } from "./create-entity.ts";
export { InvalidEntityError } from "./invalid-entity-error.ts";
export { entityKey } from "./entity-key.ts";
export { compareEntities } from "./compare-entities.ts";
