import type { Entity } from "../entity/index.ts";
import type { Provenance } from "../provenance/index.ts";

// An attribute is one piece of descriptive information ABOUT an entity: a banner, a country,
// a registrar, a technology. It is not part of the entity's identity and does not change it.
//
// ONE OBSERVATION IS A SET OF VALUES. A tool often reports several values under the same name in one
// go: every unusual header of one HTTP response, every hash found in one page. They are not
// alternatives to each other, they belong together, so they travel as ONE attribute whose `values`
// is the whole set the tool found in that observation (a name with a single value has a set of one).
// Which values belong together is the tool adapter's decision, because only it knows how the tool
// groups its findings; the core never merges or splits sets. `values` has no repeats and is kept
// sorted, so the same set always has the same shape, whatever order the tool listed it in.
//
// WHY A CONCEPT OF ITS OWN (and not a field inside Entity):
//   1. Any tool can import new information about an entity another tool (or an earlier run)
//      already found, without rediscovering it: it just sends attributes that point to the
//      entity by (type, value).
//   2. The same entity can carry attributes from MANY sources. Each attribute keeps its own
//      provenance, so two tools (or two dates) that disagree about a banner can both be kept. How
//      the repository keeps them (the current set, and the replaced ones as history) is the
//      adapter's decision, not the model's.
//
// Which tool and run it came from, and optionally the tool's own record (`recordRef`), is in
// `provenance`.
//
// Dependencies point one way: Attribute -> Entity and Attribute -> Provenance.
//
// THE QUALIFIER (optional) tells apart several sets of values that carry the SAME name for the SAME
// entity, because they come from different sources or angles: for example the module of a tool
// ("sfp_cinsscore" and "sfp_blocklistde" both say `MALICIOUS_SUBNET` about one network). Together
// with the entity and the name it is part of the attribute's identity: a newer set replaces the
// current one only when the entity, the name AND the qualifier are the same. An attribute without a
// qualifier is identified by entity and name alone. The qualifier is free text chosen by the tool; the
// core never interprets it.
//
// The attribute `name` and `values` are free-form and owned by the tool, like the entity type:
// the core carries them and never interprets them. The name gets NFC + trim; each value is
// kept as sent for now.
//
// SpiderFoot -> Attribute (translation done by the SpiderFoot ADAPTER): a DESCRIPTOR or
// SUBENTITY event becomes an attribute of the closest entity above it. The event's type
// ("WEBSERVER_BANNER", "GEOINFO"...) becomes `name`; the events of one type and module that share a
// parent event are grouped, and their `data` become `values`; the module, confidence and scan become
// the `provenance`, and the parent event's hash the `recordRef`.
//
// Build instances with `createAttribute`, which enforces the invariants. The brand below makes the
// compiler refuse a literal or an `AttributeDTO` where an `Attribute` is expected.
//
// EXPAND: the PII flag (with the raw-data work); a way to point an attribute at another
// attribute (SpiderFoot's `sobre`, for descriptor chains X -> A -> B); typed values if a
// real need appears (today everything is text).
declare const attributeBrand: unique symbol;

export interface Attribute {
  readonly entity: Entity;
  readonly name: string;
  // The whole set the tool found in one observation: at least one value, no repeats, sorted.
  readonly values: readonly string[];
  // Which source or angle of the entity and name this set belongs to; see "THE QUALIFIER" above.
  readonly qualifier?: string;
  readonly provenance: Provenance;
  // Exists only for the compiler; there is no such property at runtime.
  readonly [attributeBrand]: true;
}
