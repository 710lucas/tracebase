import { createRelation, type Relation } from "../../domain/relation/index.ts";
import { fieldPath } from "./field-path.ts";
import type { ImportSource } from "./import-source.ts";
import { parseEntityReference } from "./parse-entity-reference.ts";
import { parseItemProvenance } from "./parse-item-provenance.ts";
import { readObject } from "./read-object.ts";
import { readOptionalString } from "./read-optional-string.ts";
import { readOptionalStringList } from "./read-optional-string-list.ts";
import { withImportPath } from "./with-import-path.ts";

const RELATION_KEYS = ["source", "target", "type", "viaRecordRefs", "provenance"];

// One relation of the payload: `source` and `target` entities (required), plus optional `type`,
// `viaRecordRefs` and `provenance`.
export function parseRelation(value: unknown, path: string, batchSource: ImportSource): Relation {
  const record = readObject(value, path, RELATION_KEYS);
  const source = parseEntityReference(record["source"], fieldPath(path, "source"));
  const target = parseEntityReference(record["target"], fieldPath(path, "target"));
  const type = readOptionalString(record, "type", path);
  const viaRecordRefs = readOptionalStringList(record, "viaRecordRefs", path);
  const provenance = parseItemProvenance(
    record["provenance"],
    fieldPath(path, "provenance"),
    batchSource,
  );
  return withImportPath(path, () =>
    createRelation({
      source,
      target,
      provenance,
      ...(type !== undefined && { type }),
      ...(viaRecordRefs !== undefined && { viaRecordRefs }),
    }),
  );
}
