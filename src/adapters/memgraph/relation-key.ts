import { createHash } from "node:crypto";
import type { Relation } from "../../core/domain/relation/index.ts";

// The identity of a stored relation: a short hash of the fields that make one finding. Writing a
// relation `MERGE`s by this key, so importing the same run twice leaves the graph as it was.
//
// The fields are tool, run, module, source (type and value), target (type and value) and relation
// type. Confidence, `observedAt`, `recordedAt` and `recordRefs` are not part of it: they describe the
// finding but do not make it a different one. An absent module or type is not the same as an empty one.
//
// The fields go into a JSON list before hashing, so two different sets of fields can never produce the
// same text (with plain concatenation, `a|b` + `c` and `a` + `b|c` would). Changing this list changes
// every key already stored, so it needs a migration.
export function relationKey(relation: Relation): string {
  const identifyingFields = [
    relation.provenance.tool,
    relation.provenance.run,
    relation.provenance.module ?? null,
    relation.source.type,
    relation.source.value,
    relation.target.type,
    relation.target.value,
    relation.type ?? null,
  ];

  return createHash("sha256").update(JSON.stringify(identifyingFields)).digest("hex");
}
