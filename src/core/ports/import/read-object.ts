import { InvalidImportBatchError } from "./invalid-import-batch-error.ts";

// Checks that `value` is a plain JSON object and that it has no keys outside `allowedKeys`.
//
// Unknown keys are rejected on purpose: this is a public contract, and a typo such as
// `confidance` would otherwise be dropped silently and the sender would never know their
// confidence was lost.
export function readObject(
  value: unknown,
  path: string,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidImportBatchError(path, "must be an object");
  }
  const record = value as Record<string, unknown>;
  const unknownKey = Object.keys(record).find((key) => !allowedKeys.includes(key));
  if (unknownKey !== undefined) {
    throw new InvalidImportBatchError(
      path,
      `unknown field "${unknownKey}" (allowed: ${allowedKeys.join(", ")})`,
    );
  }
  return record;
}
