import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidImportBatchError } from "../../../../src/core/ports/import/index.ts";
import { parseItemProvenance } from "../../../../src/core/ports/import/parse-item-provenance.ts";

const source = { tool: "spiderfoot", run: "scan1" };

test("an absent block gives a provenance with only the batch source", () => {
  assert.deepEqual(parseItemProvenance(undefined, "p", source), source);
});

test("merges the batch source with the item's optional fields", () => {
  const provenance = parseItemProvenance(
    { recordRef: "a1", module: "sfp_x", confidence: 80, observedAt: 1760000000000 },
    "p",
    source,
  );
  assert.deepEqual(provenance, {
    ...source,
    recordRef: "a1",
    module: "sfp_x",
    confidence: 80,
    observedAt: 1760000000000,
  });
});

test("an item cannot override tool or run", () => {
  assert.throws(() => parseItemProvenance({ tool: "other" }, "p", source), InvalidImportBatchError);
});

test("domain rules apply and are reported at the block's path", () => {
  assert.throws(
    () => parseItemProvenance({ confidence: 101 }, "relations[0].provenance", source),
    (error: unknown) =>
      error instanceof InvalidImportBatchError && error.path === "relations[0].provenance",
  );
});
