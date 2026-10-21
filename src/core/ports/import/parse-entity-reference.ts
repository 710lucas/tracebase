import { createEntity, type Entity } from "../../domain/entity/index.ts";
import { readObject } from "./read-object.ts";
import { readRequiredString } from "./read-required-string.ts";
import { withImportPath } from "./with-import-path.ts";

const ENTITY_KEYS = ["type", "value"];

// An entity is mentioned inline, as `{ "type": ..., "value": ... }`, wherever a relation or an
// attribute needs one. The type is whatever the tool calls it; the core has no list of types.
export function parseEntityReference(value: unknown, path: string): Entity {
  const record = readObject(value, path, ENTITY_KEYS);
  const type = readRequiredString(record, "type", path);
  const entityValue = readRequiredString(record, "value", path);
  return withImportPath(path, () => createEntity(type, entityValue));
}
