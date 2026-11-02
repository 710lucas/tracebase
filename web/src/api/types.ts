// The shapes the API answers with, as plain data. They are written here by hand, not imported from the
// API's code: the front end and the API share nothing but the HTTP contract (see `docs/frontend.md`).

export interface EntityRef {
  type: string;
  value: string;
}

// Where and when a finding came from. Only `tool`, `run` and `recordedAt` are always there.
export interface Provenance {
  tool: string;
  run: string;
  module?: string;
  recordRef?: string;
  confidence?: number;
  observedAt?: number;
  recordedAt?: number;
}

export interface Relation {
  source: EntityRef;
  target: EntityRef;
  type?: string;
  provenance: Provenance;
}

export interface Attribute {
  name: string;
  // Which source or angle of the entity and name this set belongs to (for SpiderFoot, the module).
  qualifier?: string;
  // Everything the tool found together in one observation (one or more texts, sorted, no repeats).
  values: string[];
  provenance: Provenance;
}

export interface EntityFindings {
  entity: EntityRef;
  relations: Relation[];
  attributes: Attribute[];
}

export interface RunSummary {
  tool: string;
  run: string;
  relations: number;
  attributes: number;
  receivedAt?: number;
}

export interface EntityTypeCount {
  type: string;
  count: number;
}

export interface EntityPage {
  total: number;
  entities: EntityRef[];
}

export interface GraphTotals {
  entities: number;
  relations: number;
  attributes: number;
}

export interface StatusReport {
  storage: "memory" | "memgraph";
  memgraphUrl?: string;
  reachable: boolean;
  totals?: GraphTotals;
  error?: string;
}

// What to ask for when listing the entities of one type.
export interface EntityListOptions {
  search: string;
  limit: number;
  offset: number;
}
