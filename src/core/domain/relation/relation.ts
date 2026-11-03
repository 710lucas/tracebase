import type { Entity } from "../entity/index.ts";
import type { Provenance } from "../provenance/index.ts";

// A relation links two entities and comes from ONE finding (decision of 2026-10-19): if two
// scans see the same link, there are two relations, each with its own provenance. We never
// overwrite one scan's information with another's.
//
// Dependencies point one way only: Relation -> Entity and Relation -> Provenance.
// Entity and Provenance know nothing about Relation.
//
// SpiderFoot -> Relation (translation done by the SpiderFoot ADAPTER): an ENTITY/INTERNAL event
// is the `target`; its closest entity ancestor (via `source_event_hash`) is the `source`;
// that event's hash, module, confidence and scan become the `provenance`.
//
// Build instances with `createRelation`, which enforces the invariants. The brand below makes the
// compiler refuse a literal or a `RelationDTO` where a `Relation` is expected.
declare const relationBrand: unique symbol;

export interface Relation {
  readonly source: Entity;
  readonly target: Entity;
  readonly provenance: Provenance;

  // What kind of link this is ("resolves_to", "owns"...). Optional and free-form, owned by the
  // TOOL exactly like the entity type: the core never lists or interprets it. A tool that has
  // no notion of relation type simply leaves it out. The core only applies NFC + trim to it.
  //
  // SpiderFoot: its events carry no relation type, so the adapter leaves it undefined. The
  // meaning is in the pair of entity types. If a mapping is wanted later, the adapter decides it.
  readonly type?: string;

  // References to the tool's own records of the intermediate events the link passed through
  // without turning them into entities, in order. Covers the X -> A -> C case: A is a
  // descriptor in the path, so the edge X -> C would otherwise lose it. Those events belong to
  // the same tool and the same run as this relation. Like `Provenance.recordRefs`, it is optional
  // and only makes sense for a tool that has such records. Absent or empty means "direct link".
  //
  // SpiderFoot: when walking up `source_event_hash` from C to the closest entity X, every
  // DESCRIPTOR/SUBENTITY event in between contributes its `hash` here, nearest to X first.
  // Whether DATA events in the path count too is not decided, and how often this happens in
  // real scans is still unmeasured (see `.claude/decisions.md`).
  //
  // EXAMPLE (illustrative values). SpiderFoot finds an e-mail address on a page it crawled:
  //
  //   INTERNET_NAME  www.example.com                      <- entity X
  //   └─ LINKED_URL_INTERNAL  https://www.example.com/contact   (SUBENTITY, not an entity)
  //      └─ EMAILADDR  contact@example.com                <- entity C
  //
  // The relation is www.example.com -> contact@example.com, with `provenance.recordRefs` = the
  // e-mail event's hash and `viaRecordRefs` = [the URL event's hash]. Without it the edge would
  // not say the address was found through that URL, because the URL becomes an attribute of
  // www.example.com and the link skips it. A tool with no records leaves the field out.
  readonly viaRecordRefs?: readonly string[];
  // Exists only for the compiler; there is no such property at runtime.
  readonly [relationBrand]: true;
}
