import { fieldPath } from "./field-path.ts";
import { InvalidImportBatchError } from "./invalid-import-batch-error.ts";

// Reads a field that may be absent; when present it must be an array. The elements are returned
// untouched: each parser checks its own kind of element.
export function readOptionalArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
): readonly unknown[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new InvalidImportBatchError(fieldPath(path, key), "must be an array when present");
  }
  return value;
}
