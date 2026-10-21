import { normalizeText } from "../text/index.ts";
import { InvalidRelationError } from "./invalid-relation-error.ts";
import type { Relation } from "./relation.ts";

// The only supported way to build a Relation. Guarantees:
//   - `type`, when present, is normalized (NFC + trim) and not blank;
//   - every entry of `viaRecordRefs`, when present, is not blank;
//   - the result is immutable, including the `viaRecordRefs` list (copied, so the caller cannot
//     change it afterwards).
//
// The entities and the provenance are expected to have been built with `createEntity` and
// `createProvenance`, so they are not validated again here: each rule lives in one place.
//
// SpiderFoot note: the adapter calls this once per ENTITY/INTERNAL event with an entity ancestor.
//
// EXPAND: reject a relation whose source and target are the same entity, if self-links turn out
// to be noise in real scans (not decided).
export function createRelation(fields: Relation): Relation {
  const normalizedType = fields.type === undefined ? undefined : normalizeText(fields.type);
  if (normalizedType === "") {
    throw new InvalidRelationError("type must not be blank when present");
  }
  if (fields.viaRecordRefs?.some((ref) => ref.trim() === "")) {
    throw new InvalidRelationError("viaRecordRefs must not contain blank entries");
  }
  return Object.freeze({
    ...fields,
    ...(normalizedType !== undefined && { type: normalizedType }),
    ...(fields.viaRecordRefs !== undefined && {
      viaRecordRefs: Object.freeze([...fields.viaRecordRefs]),
    }),
  });
}
