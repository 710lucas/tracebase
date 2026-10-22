// An entity is "a thing in the world": the domain example.com, the IP 1.2.3.4, an e-mail address.
// It is the node of the knowledge graph.
//
// Its identity is the pair (type, value). Two entities with the same pair are the same node,
// which is what lets the graph merge findings from different scans and different tools.
//
// DECOUPLING: this shape knows nothing about where the entity was found and carries no
// descriptive data. There is no tool name, run id, module, confidence, timestamp or raw payload
// here. Provenance lives in `../provenance`, and descriptive information (banner, geolocation...)
// lives in `../attribute`, which references an entity. The same entity can therefore be seen and
// described by any number of tools without this type ever changing.
//
// SpiderFoot -> Entity (translation done by the SpiderFoot ADAPTER):
//   event type  (`type`)  -> `type`
//   event data  (`data`)  -> `value`, after the adapter strips SpiderFoot markup such as <SFURL>
//   hash, source hash, module, confidence, scan id, false_positive -> NOT here (provenance)
//   DESCRIPTOR / SUBENTITY events -> NOT entities: they become attributes of the entity above them
//
// Build instances with `createEntity`, which enforces the invariants. Instances are immutable.
// The brand below makes the compiler refuse an object literal where an `Entity` is expected, so every
// `Entity` in the system went through `createEntity`.
//
// EXPAND: the PII flag goes with the raw-data work.
declare const entityBrand: unique symbol;

export interface Entity {
  // The kind of thing: "DOMAIN_NAME", "IP_ADDRESS", "EMAILADDR"...
  //
  // OWNERSHIP (decision of 2026-10-19): the TOOL defines its types, not the core. The core never
  // lists, validates or interprets them; it only carries them between the points of the system
  // (adapter -> core -> graph -> queries). That is why this is a plain string. The only thing
  // the core does to it is the basic text hygiene (NFC + trim, see `normalizeText`).
  //
  // SpiderFoot: its event type (`tbl_scan_results.type`, e.g. "IP_ADDRESS", "INTERNET_NAME") is
  // passed through unchanged. SpiderFoot's own *classes* (ENTITY, DESCRIPTOR, SUBENTITY, DATA,
  // INTERNAL) are not types: they only decide whether an event becomes an entity at all.
  //
  // OPEN: if two tools name the same kind of thing differently (SpiderFoot "IP_ADDRESS" vs
  // another tool's "ipv4-addr"), they will NOT merge into one node. If that is needed, the tool
  // should *declare* a mapping and the core only applies it. Decide when the 2nd tool arrives.
  readonly type: string;
  readonly value: string;
  // Exists only for the compiler; there is no such property at runtime.
  readonly [entityBrand]: true;
}
