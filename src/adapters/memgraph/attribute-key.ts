import { createHash } from "node:crypto";
import type { Attribute } from "../../core/domain/attribute/index.ts";

// The identity of one observation of an attribute: a hash of the fields that make it one finding.
// Seeing the same key again means the same import was sent twice.
//
// The fields are tool, run, module, entity (type and value), name and value. Confidence, `observedAt`,
// `recordedAt` and `recordRef` describe the finding but do not make it a different one. Like
// `relationKey`, the fields go into a JSON list before hashing so that no two different sets of
// fields give the same text, and changing the list changes every key already stored.
export function attributeKey(attribute: Attribute): string {
  const identifyingFields = [
    attribute.provenance.tool,
    attribute.provenance.run,
    attribute.provenance.module ?? null,
    attribute.entity.type,
    attribute.entity.value,
    attribute.name,
    attribute.value,
  ];

  return createHash("sha256").update(JSON.stringify(identifyingFields)).digest("hex");
}
