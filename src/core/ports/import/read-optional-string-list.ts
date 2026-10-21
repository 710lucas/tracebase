import { fieldPath, itemPath } from "./field-path.ts";
import { InvalidImportBatchError } from "./invalid-import-batch-error.ts";
import { readOptionalArray } from "./read-optional-array.ts";

// Reads a field that may be absent; when present it must be an array of strings.
export function readOptionalStringList(
  record: Record<string, unknown>,
  key: string,
  path: string,
): readonly string[] | undefined {
  const items = readOptionalArray(record, key, path);
  if (items === undefined) {
    return undefined;
  }
  return items.map((item, index) => {
    if (typeof item !== "string") {
      throw new InvalidImportBatchError(itemPath(fieldPath(path, key), index), "must be a string");
    }
    return item;
  });
}
