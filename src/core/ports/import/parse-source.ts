import { createProvenance } from "../../domain/provenance/index.ts";
import type { ImportSource } from "./import-source.ts";
import { readObject } from "./read-object.ts";
import { readRequiredString } from "./read-required-string.ts";
import { withImportPath } from "./with-import-path.ts";

const SOURCE_KEYS = ["tool", "run"];

// Reads the `source` block. `tool` and `run` are checked through `createProvenance` so the rule
// "not blank" lives only in the domain, and an empty batch is still rejected when its source is bad.
export function parseSource(value: unknown, path: string): ImportSource {
  const record = readObject(value, path, SOURCE_KEYS);
  const tool = readRequiredString(record, "tool", path);
  const run = readRequiredString(record, "run", path);
  withImportPath(path, () => createProvenance({ tool, run }));
  return { tool, run };
}
