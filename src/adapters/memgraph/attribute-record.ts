import type { Attribute } from "../../core/domain/attribute/index.ts";
import type { Entity } from "../../core/domain/entity/index.ts";
import { attributeKey } from "./attribute-key.ts";

// The current value of one attribute of one entity, as it is stored in the entity node's `attributes`
// map: `entity.attributes["WEBSERVER_BANNER"].value` is the most recent value. It keeps the value, the
// provenance of the observation that brought it and its `key`. `updatedAt` is the latest date the same
// value was seen again; it is absent until that happens.
export interface AttributeRecord {
  value: string;
  tool: string;
  run: string;
  module?: string;
  confidence?: number;
  recordRef?: string;
  observedAt?: number;
  recordedAt?: number;
  updatedAt?: number;
  key: string;
}

export function toAttributeRecord(attribute: Attribute): AttributeRecord {
  const { provenance } = attribute;

  return {
    value: attribute.value,
    tool: provenance.tool,
    run: provenance.run,
    module: provenance.module,
    confidence: provenance.confidence,
    recordRef: provenance.recordRef,
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
// name of one entity (for example, the "banner" of the IP 1.1.1.1) and has at most one current record.
//
// A `Map` needs one value as its key, and here the attribute is made of three (entity type, entity value
// and name), so they are joined into one text. It is a JSON list, so two different combinations never
// give the same text.
//
//   attributeLookupKey(IP 1.1.1.1, "banner")  ->  '["IP_ADDRESS","1.1.1.1","banner"]'
export function attributeLookupKey(entity: Entity, name: string): string {
  return JSON.stringify([entity.type, entity.value, name]);
}
