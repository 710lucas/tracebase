// The data `createProvenance` turns into a `Provenance`: the same fields, not yet validated. What each
// field means is described in `provenance.ts`.
export interface ProvenanceDTO {
  tool: string;
  run: string;
  recordRefs?: readonly string[];
  module?: string;
  confidence?: number;
  observedAt?: number;
  recordedAt?: number;
}
