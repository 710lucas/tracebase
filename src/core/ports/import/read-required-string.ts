import { fieldPath } from "./field-path.ts";
import { InvalidImportBatchError } from "./invalid-import-batch-error.ts";

// Reads a field that must be present and must be a string. Only the JSON type is checked here;
// rules about the content (not blank, and so on) belong to the domain `create*` functions.
export function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new InvalidImportBatchError(fieldPath(path, key), "must be a string");
  }
  return value;
}
