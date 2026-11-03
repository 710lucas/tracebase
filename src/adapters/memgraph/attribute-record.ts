import type { Attribute } from "../../core/domain/attribute/index.ts";
import type { Entity } from "../../core/domain/entity/index.ts";
import { attributeKey } from "./attribute-key.ts";

// One set of values of one attribute of one entity, with the provenance of the observation that brought
// it. The current set is stored in the entity node's `attributes` map, which has one entry per name and,
// inside it, one per qualifier (`entity.attributes["WEBSERVER_STRANGEHEADER"][""].values` is the most
// recent set of an attribute without a qualifier, see `NO_QUALIFIER`); a set that was replaced is stored
// as an `:Attribute` node with the same fields plus its `name` and, when it has one, its `qualifier`.
// `updatedAt` is the latest date the same set was seen again; it is absent until that happens.
export interface AttributeRecord {
  // Sorted and without repeats, like `Attribute.values`.
  values: string[];
  tool: string;
  run: string;
  module?: string;
  confidence?: number;
  recordRefs?: string[];
  observedAt?: number;
  recordedAt?: number;
  updatedAt?: number;
  key: string;
}

// The map key under which the current record of an attribute WITHOUT a qualifier is stored. A real
// qualifier is never blank (the domain refuses it), so this key cannot clash with one.
export const NO_QUALIFIER = "";

export function toQualifierKey(qualifier: string | undefined): string {
  return qualifier ?? NO_QUALIFIER;
}

export function fromQualifierKey(key: string): string | undefined {
  return key === NO_QUALIFIER ? undefined : key;
}

// What the database already holds about the attributes of some entities: the current record of each
// attribute (found by `attributeLookupKey`) and the keys of every replaced value kept as a node.
export interface StoredAttributes {
  readonly records: ReadonlyMap<string, AttributeRecord>;
  readonly historyKeys: ReadonlySet<string>;
}

export function toAttributeRecord(attribute: Attribute): AttributeRecord {
  const { provenance } = attribute;

  return {
    values: [...attribute.values],
    tool: provenance.tool,
    run: provenance.run,
    module: provenance.module,
    confidence: provenance.confidence,
    recordRefs: provenance.recordRefs === undefined ? undefined : [...provenance.recordRefs],
    observedAt: provenance.observedAt,
    recordedAt: provenance.recordedAt,
    key: attributeKey(attribute),
  };
}

// The date used to order observations: when the tool saw it, or else when our system received it. An
// observation with neither sorts before all others.
export function dateOf(dates: { observedAt?: number; recordedAt?: number }): number {
  return dates.observedAt ?? dates.recordedAt ?? 0;
}

// The key used to look up the current record of an attribute in a `Map`. An attribute is one attribute
// name of one entity and one qualifier (for example, the "banner" of the IP 1.1.1.1 that the module
// "sfp_webserver" reported) and has at most one current record.
//
// A `Map` needs one value as its key, and here the attribute is made of four (entity type, entity value,
// name and qualifier), so they are joined into one text. It is a JSON list, so two different combinations
// never give the same text.
//
//   attributeLookupKey(IP 1.1.1.1, "banner", "sfp_webserver")  ->  '["IP_ADDRESS","1.1.1.1","banner","sfp_webserver"]'
//   attributeLookupKey(IP 1.1.1.1, "banner")                    ->  '["IP_ADDRESS","1.1.1.1","banner",""]'
export function attributeLookupKey(entity: Entity, name: string, qualifier?: string): string {
  return JSON.stringify([entity.type, entity.value, name, toQualifierKey(qualifier)]);
}
