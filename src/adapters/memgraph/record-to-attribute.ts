import { createAttribute, type Attribute } from "../../core/domain/attribute/index.ts";
import type { Entity } from "../../core/domain/entity/index.ts";
import type { AttributeRecord } from "./attribute-record.ts";
import { toProvenance } from "./stored-provenance.ts";

// Builds the `Attribute` that was saved as this record, whether it is the current record of the entity
// or a replaced value kept as a node. `updatedAt` and `key` belong to the storage and are not part of
// an `Attribute`.
export function recordToAttribute(
  entity: Entity,
  name: string,
  record: AttributeRecord,
): Attribute {
  return createAttribute({
    entity,
    name,
    values: record.values,
    provenance: toProvenance(record),
  });
}
