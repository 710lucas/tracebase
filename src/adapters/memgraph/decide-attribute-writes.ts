import type { Attribute } from "../../core/domain/attribute/index.ts";
import type { Entity } from "../../core/domain/entity/index.ts";
import {
  attributeLookupKey,
  dateOf,
  toAttributeRecord,
  type AttributeRecord,
} from "./attribute-record.ts";

// A current record that has to be written to an entity node.
export interface AttributeWrite {
  readonly entity: Entity;
  readonly name: string;
  readonly record: AttributeRecord;
}

// Decides what an import changes in the current records (the rule of `.claude/decisions.md`, "Attributes:
// the current value lives on the entity"), given the records the database already has. It does not
// touch the database: it only answers which records to write.
//
// An attribute is one attribute name of one entity (the "banner" of the IP 1.1.1.1) and has at most one
// current record. The attributes of the import are observations: each one says "this tool saw this
// value for that attribute", and many of them can talk about the same attribute.
//
// Each observation is applied, in the order it came, on the record its attribute has by then: the
// database's, or the one an earlier observation of this same import left. The import is not written
// until the end, so this is the only way a later observation can see an earlier one.
//
// EXPAND: the case of a different value, in slice 4c-2 (see `applyObservation`).
export function decideAttributeWrites(
  attributes: readonly Attribute[],
  currentRecords: ReadonlyMap<string, AttributeRecord>,
): AttributeWrite[] {
  // The record of each attribute as it stands while the import is being applied.
  const records = new Map(currentRecords);
  // The attributes whose record ended up different from the database's, one write for each.
  const writes = new Map<string, AttributeWrite>();

  for (const attribute of attributes) {
    const lookupKey = attributeLookupKey(attribute.entity, attribute.name);
    const before = records.get(lookupKey);
    const after = applyObservation(before, attribute);

    // `applyObservation` returns the very same object when the observation changes nothing.
    if (after === before) continue;

    records.set(lookupKey, after);
    writes.set(lookupKey, { entity: attribute.entity, name: attribute.name, record: after });
  }

  return [...writes.values()];
}

// Returns the record as it is after one more observation; the same object when nothing changes.
//
// 1. No current record: the observation becomes the current record.
// 2. Same key as the current record: the same import sent again, nothing changes.
// 3. Same value, other key (another run or tool saw it again): only `updatedAt` moves forward.
// 4. A different value is not handled yet: it needs the history nodes (slice 4c-2), so it is refused
//    instead of overwriting or dropping a value.
function applyObservation(
  current: AttributeRecord | undefined,
  attribute: Attribute,
): AttributeRecord {
  const incoming = toAttributeRecord(attribute);

  if (current === undefined) return incoming;
  if (current.key === incoming.key) return current;

  if (current.value !== incoming.value) {
    throw new Error(
      `attribute "${attribute.name}" of ${attribute.entity.type} ${attribute.entity.value} already ` +
        "has a different value, and keeping the history of values is not implemented yet",
    );
  }

  return moveUpdatedAt(current, incoming);
}

// The same value was seen again: the value and the provenance stay, and the record only moves to the
// later date, if the new observation is later than the latest one already seen.
function moveUpdatedAt(current: AttributeRecord, incoming: AttributeRecord): AttributeRecord {
  const latestSeen = current.updatedAt ?? dateOf(current);
  const seenAt = dateOf(incoming);

  return seenAt > latestSeen ? { ...current, updatedAt: seenAt } : current;
}
