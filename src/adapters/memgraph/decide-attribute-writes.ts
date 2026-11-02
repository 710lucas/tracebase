import type { Attribute } from "../../core/domain/attribute/index.ts";
import type { Entity } from "../../core/domain/entity/index.ts";
import {
  attributeLookupKey,
  dateOf,
  toAttributeRecord,
  type AttributeRecord,
  type StoredAttributes,
} from "./attribute-record.ts";

// A record of one attribute of one entity that has to be written.
export interface AttributeWrite {
  readonly entity: Entity;
  readonly name: string;
  readonly qualifier?: string;
  readonly record: AttributeRecord;
}

export interface AttributeWrites {
  // Records that become (or change in) the entity node's `attributes` map.
  readonly current: AttributeWrite[];
  // Replaced values that are kept as `:Attribute` nodes.
  readonly history: AttributeWrite[];
}

// Decides what an import changes in the attributes (the rule of `.claude/decisions.md`, "Attributes:
// the current value lives on the entity"), given what the database already holds. It does not touch the
// database: it only answers which records to write.
//
// An attribute is one attribute name of one entity and one qualifier (the "banner" of the IP 1.1.1.1 that
// the module "sfp_webserver" reported; without a qualifier, the "banner" of the IP) and has at most one
// current record. Sets with different qualifiers never replace each other. The attributes of the import are observations: each one says "this tool saw this set
// of values for that attribute", and many of them can talk about the same attribute. A set is compared
// as a whole with the current one: values never enter or leave a set that was already stored.
//
// Each observation is applied, in the order it came, on the record its attribute has by then: the
// database's, or the one an earlier observation of this same import left. The import is not written
// until the end, so this is the only way a later observation can see an earlier one.
export function decideAttributeWrites(
  attributes: readonly Attribute[],
  stored: StoredAttributes,
): AttributeWrites {
  // The record of each attribute as it stands while the import is being applied.
  const records = new Map(stored.records);
  // The keys of the values already kept as nodes, including those this import is adding.
  const historyKeys = new Set(stored.historyKeys);
  // The attributes whose record ended up different from the database's, one write for each.
  const current = new Map<string, AttributeWrite>();
  const history: AttributeWrite[] = [];

  for (const attribute of attributes) {
    const incoming = toAttributeRecord(attribute);

    // The same observation, already kept as a node: the same import sent again.
    if (historyKeys.has(incoming.key)) continue;

    const lookupKey = attributeLookupKey(attribute.entity, attribute.name, attribute.qualifier);
    const before = records.get(lookupKey);
    const after = applyObservation(before, incoming);
    const { entity, name } = attribute;
    const qualifier = attribute.qualifier === undefined ? {} : { qualifier: attribute.qualifier };

    if (after.replaced !== undefined) {
      history.push({ entity, name, ...qualifier, record: after.replaced });
      historyKeys.add(after.replaced.key);
    }

    // `applyObservation` returns the very same object when the current record does not change.
    if (after.current !== before) {
      records.set(lookupKey, after.current);
      current.set(lookupKey, { entity, name, ...qualifier, record: after.current });
    }
  }

  return { current: [...current.values()], history };
}

interface Outcome {
  // The record the attribute has after the observation.
  current: AttributeRecord;
  // A value that has to be kept as a node because of it: the old current one, or the observation itself.
  replaced?: AttributeRecord;
}

// What one more observation does to an attribute, given its current record:
//
// 1. No current record: the observation becomes the current record.
// 2. Same key as the current record: the same import sent again, nothing changes.
// 3. Same set, other key (another run or tool saw it again): only `updatedAt` moves forward.
// 4. Different set, newer than the latest date the current record was seen: the current record is
//    kept as a node, and the observation becomes the current record.
// 5. Different set, not newer (an import that arrived late): the observation is kept as a node and
//    the current record stays.
function applyObservation(
  current: AttributeRecord | undefined,
  incoming: AttributeRecord,
): Outcome {
  if (current === undefined) return { current: incoming };
  if (current.key === incoming.key) return { current };
  if (sameValues(current.values, incoming.values)) {
    return { current: moveUpdatedAt(current, incoming) };
  }

  return dateOf(incoming) > latestSeen(current)
    ? { current: incoming, replaced: current }
    : { current, replaced: incoming };
}

// The latest date a record was seen: when its value was seen again, or else when it was first seen.
function latestSeen(record: AttributeRecord): number {
  return record.updatedAt ?? dateOf(record);
}

// The same value was seen again: the value and the provenance stay, and the record only moves to the
// later date, if the new observation is later than the latest one already seen.
function moveUpdatedAt(current: AttributeRecord, incoming: AttributeRecord): AttributeRecord {
  const seenAt = dateOf(incoming);

  return seenAt > latestSeen(current) ? { ...current, updatedAt: seenAt } : current;
}

// Two sets are the same when they hold the same values. Both are sorted and without repeats (the domain
// and `toAttributeRecord` see to that), so comparing them position by position is enough.
function sameValues(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}
