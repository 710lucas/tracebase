import { fieldPath, itemPath, ROOT_PATH } from "./field-path.ts";
import type { ImportBatch } from "./import-batch.ts";
import { parseAttribute } from "./parse-attribute.ts";
import { parseRelation } from "./parse-relation.ts";
import { parseSource } from "./parse-source.ts";
import { readObject } from "./read-object.ts";
import { readOptionalArray } from "./read-optional-array.ts";

const BATCH_KEYS = ["source", "relations", "attributes"];

// The single entry point of the import contract: takes anything (parsed JSON, so `unknown`) and
// returns a trusted ImportBatch or throws InvalidImportBatchError with the path of the problem.
//
// All-or-nothing: the first problem rejects the whole batch, so a half-valid run is never
// partially ingested. `relations` and `attributes` are each optional (a run may find only one kind).
//
// EXPAND: collect every problem instead of stopping at the first, if senders find fixing one error
// per request too slow. The error class would then carry a list.
export function parseImportBatch(input: unknown): ImportBatch {
  const record = readObject(input, ROOT_PATH, BATCH_KEYS);
  const source = parseSource(record["source"], fieldPath(ROOT_PATH, "source"));
  const relationsPath = fieldPath(ROOT_PATH, "relations");
  const attributesPath = fieldPath(ROOT_PATH, "attributes");
  const relations = (readOptionalArray(record, "relations", ROOT_PATH) ?? []).map((item, index) =>
    parseRelation(item, itemPath(relationsPath, index), source),
  );
  const attributes = (readOptionalArray(record, "attributes", ROOT_PATH) ?? []).map((item, index) =>
    parseAttribute(item, itemPath(attributesPath, index), source),
  );
  return Object.freeze({
    source,
    relations: Object.freeze(relations),
    attributes: Object.freeze(attributes),
  });
}
