import { fieldPath } from "./field-path.ts";
import { InvalidImportBatchError } from "./invalid-import-batch-error.ts";

// Reads a field that may be absent; when present it must be a finite number. Ranges (such as
// confidence 0-100) are checked by the domain.
export function readOptionalNumber(
  record: Record<string, unknown>,
  key: string,
  path: string,
): number | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidImportBatchError(fieldPath(path, key), "must be a number when present");
  }
  return value;
}
