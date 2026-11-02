import type { Entity } from "../entity/index.ts";
import type { Provenance } from "../provenance/index.ts";

// The data `createAttribute` turns into an `Attribute`: the same fields, not yet validated (the
// entity and the provenance are already validated models). What each field means is described in
// `attribute.ts`.
export interface AttributeDTO {
  entity: Entity;
  name: string;
  values: readonly string[];
  provenance: Provenance;
}
