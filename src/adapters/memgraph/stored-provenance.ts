import { createProvenance, type Provenance } from "../../core/domain/provenance/index.ts";

// The provenance fields as the adapter stores them, on an edge, in a current record or in an
// `:Attribute` node. Any other property that sits next to them (the `key`, `updatedAt`, the text of a
// relation type...) is not part of the provenance and is ignored here.
export interface StoredProvenance {
  tool: string;
  run: string;
  module?: string;
  confidence?: number;
  recordRefs?: string[];
  observedAt?: number;
  recordedAt?: number;
}

// Builds the `Provenance` again from what is stored, through `createProvenance` so that what leaves the
// adapter has been validated like everything else. A field that was not stored is left out, not set to
// `undefined`, so the result equals the `Provenance` that was saved.
export function toProvenance(stored: StoredProvenance): Provenance {
  return createProvenance({
    tool: stored.tool,
    run: stored.run,
    ...(stored.module !== undefined && { module: stored.module }),
    ...(stored.confidence !== undefined && { confidence: stored.confidence }),
    ...(stored.recordRefs !== undefined && { recordRefs: stored.recordRefs }),
    ...(stored.observedAt !== undefined && { observedAt: stored.observedAt }),
    ...(stored.recordedAt !== undefined && { recordedAt: stored.recordedAt }),
  });
}
