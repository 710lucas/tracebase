import { createAttribute, type Attribute } from "../../domain/attribute/index.ts";
import { fieldPath } from "./field-path.ts";
import type { ImportSource } from "./import-source.ts";
import { parseEntityReference } from "./parse-entity-reference.ts";
import { parseItemProvenance } from "./parse-item-provenance.ts";
import { readObject } from "./read-object.ts";
import { readRequiredString } from "./read-required-string.ts";
import { withImportPath } from "./with-import-path.ts";

const ATTRIBUTE_KEYS = ["entity", "name", "value", "provenance"];

// One attribute of the payload: the `entity` it describes, its `name` and `value`, and an optional
// `provenance`. The value is always text; the core does not interpret it.
export function parseAttribute(value: unknown, path: string, batchSource: ImportSource): Attribute {
  const record = readObject(value, path, ATTRIBUTE_KEYS);
  const entity = parseEntityReference(record["entity"], fieldPath(path, "entity"));
  const name = readRequiredString(record, "name", path);
  const attributeValue = readRequiredString(record, "value", path);
  const provenance = parseItemProvenance(
    record["provenance"],
    fieldPath(path, "provenance"),
    batchSource,
  );
  return withImportPath(path, () =>
    createAttribute({ entity, name, value: attributeValue, provenance }),
  );
}
