import type { Entity } from "../entity/index.ts";
import type { Provenance } from "../provenance/index.ts";

// An attribute is one piece of descriptive information ABOUT an entity: a banner, a country,
// a registrar, a technology. It is not part of the entity's identity and does not change it.
//
// WHY A CONCEPT OF ITS OWN (and not a field inside Entity):
//   1. Any tool can import new information about an entity another tool (or an earlier run)
//      already found, without rediscovering it: it just sends attributes that point to the
//      entity by (type, value).
//   2. The same entity can carry attributes from MANY sources. Each attribute keeps its own
//      provenance, so two tools (or two dates) that disagree about a banner both stay in the
//      graph; nothing is overwritten. How to present conflicts (all of them, the latest by
//      `observedAt`, the most confident) is a query decision, not a storage one.
//
// Which tool and run it came from, and optionally the tool's own record (`recordRef`), is in
// `provenance`.
//
// Dependencies point one way: Attribute -> Entity and Attribute -> Provenance.
//
// The attribute `name` and `value` are free-form and owned by the tool, like the entity type:
// the core carries them and never interprets them. The name gets NFC + trim; the value is
// kept as sent for now.
//
// SpiderFoot -> Attribute (translation done by the SpiderFoot ADAPTER): a DESCRIPTOR or
// SUBENTITY event becomes an attribute of the closest entity above it. The event's type
// ("WEBSERVER_BANNER", "GEOINFO"...) becomes `name`; its `data` becomes `value`; its module,
// confidence and scan become the `provenance`, and its hash the `recordRef`.
//
// Build instances with `createAttribute`, which enforces the invariants.
//
// EXPAND: the PII flag (with the raw-data work); a way to point an attribute at another
// attribute (SpiderFoot's `sobre`, for descriptor chains X -> A -> B); typed values if a
// real need appears (today everything is text).
export interface Attribute {
  readonly entity: Entity;
  readonly name: string;
  readonly value: string;
  readonly provenance: Provenance;
}
