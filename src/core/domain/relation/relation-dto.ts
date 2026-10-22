import type { Entity } from "../entity/index.ts";
import type { Provenance } from "../provenance/index.ts";

// The data `createRelation` turns into a `Relation`: the same fields, not yet validated (the entities
// and the provenance are already validated models). What each field means is described in
// `relation.ts`.
export interface RelationDTO {
  source: Entity;
  target: Entity;
  provenance: Provenance;
  type?: string;
  viaRecordRefs?: readonly string[];
}
