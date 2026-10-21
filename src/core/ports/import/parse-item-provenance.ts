import { createProvenance, type Provenance } from "../../domain/provenance/index.ts";
import type { ImportSource } from "./import-source.ts";
import { readObject } from "./read-object.ts";
import { readOptionalNumber } from "./read-optional-number.ts";
import { readOptionalString } from "./read-optional-string.ts";
import { withImportPath } from "./with-import-path.ts";

const ITEM_PROVENANCE_KEYS = ["recordRef", "module", "confidence", "observedAt"];

// Builds one item's provenance from the batch `source` plus the item's own optional `provenance`
// block. The block itself is optional (a tool with no extra detail sends nothing); `tool` and
// `run` are not accepted here because they come from the batch.
export function parseItemProvenance(
  value: unknown,
  path: string,
  source: ImportSource,
): Provenance {
  const record = value === undefined ? {} : readObject(value, path, ITEM_PROVENANCE_KEYS);
  const recordRef = readOptionalString(record, "recordRef", path);
  const module = readOptionalString(record, "module", path);
  const confidence = readOptionalNumber(record, "confidence", path);
  const observedAt = readOptionalNumber(record, "observedAt", path);
  return withImportPath(path, () =>
    createProvenance({
      ...source,
      ...(recordRef !== undefined && { recordRef }),
      ...(module !== undefined && { module }),
      ...(confidence !== undefined && { confidence }),
      ...(observedAt !== undefined && { observedAt }),
    }),
  );
}
