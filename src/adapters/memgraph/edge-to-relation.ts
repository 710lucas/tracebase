import { createEntity } from "../../core/domain/entity/index.ts";
import { createRelation, type Relation } from "../../core/domain/relation/index.ts";
import { toProvenance, type StoredProvenance } from "./stored-provenance.ts";

// An edge as read from the database: its properties and the two entities it links.
export interface EdgeRow {
  properties: StoredProvenance & { key: string; type?: string; viaRecordRefs?: string[] };
  sourceType: string;
  sourceValue: string;
  targetType: string;
  targetValue: string;
}

// Builds the `Relation` that was saved as this edge. The relation type is the text the tool sent, kept
// as a property; the label of the edge only has its normalized form.
export function edgeToRelation(edge: EdgeRow): Relation {
  const { properties } = edge;

  return createRelation({
    source: createEntity(edge.sourceType, edge.sourceValue),
    target: createEntity(edge.targetType, edge.targetValue),
    provenance: toProvenance(properties),
    ...(properties.type !== undefined && { type: properties.type }),
    ...(properties.viaRecordRefs !== undefined && { viaRecordRefs: properties.viaRecordRefs }),
  });
}
