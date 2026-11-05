import type { Attribute } from "../../core/domain/attribute/index.ts";
import type { Entity } from "../../core/domain/entity/index.ts";
import { fromQualifierKey, type AttributeRecord } from "./attribute-record.ts";
import { recordToAttribute } from "./record-to-attribute.ts";

// The current attributes of an entity, read from the `attributes` map of its node: one record per name
// and, inside each name, one per qualifier. The replaced values kept as `:Attribute` nodes (the history)
// are not here.
export function currentAttributesOf(
  entity: Entity,
  current: Record<string, Record<string, AttributeRecord>> | null | undefined,
): Attribute[] {
  return Object.entries(current ?? {}).flatMap(([name, byQualifier]) =>
    Object.entries(byQualifier).map(([qualifierKey, record]) =>
      recordToAttribute(entity, name, fromQualifierKey(qualifierKey), record),
    ),
  );
}
