import { fieldPath } from "./field-path.ts";
import { InvalidImportBatchError } from "./invalid-import-batch-error.ts";

// Reads a field that may be absent; when present it must be a string.
export function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new InvalidImportBatchError(fieldPath(path, key), "must be a string when present");
  }
  return value;
}
