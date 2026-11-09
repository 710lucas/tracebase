import type { Entity } from "../../domain/entity/index.ts";
import type { MatchMode } from "./match-mode.ts";

// The questions about the graph as a whole, as opposed to `findEntity`, which is about one entity. They
// feed the screens that show what has been imported and let someone browse it.

// One run of one tool, as the graph knows it: how many relations and attribute values carry that run in
// their provenance. A run is not stored as a node of its own; it is whatever (`tool`, `run`) pair the
// provenance mentions. `receivedAt` is the earliest `recordedAt` among them, that is, when our system
// first received something of this run; it is absent when no stored item carries one.
export interface RunSummary {
  readonly tool: string;
  readonly run: string;
  readonly relations: number;
  readonly attributes: number;
  readonly receivedAt?: number;
}

// How many entities of one type the graph holds.
export interface EntityTypeCount {
  readonly type: string;
  readonly count: number;
}

// The size of the whole graph. `attributes` counts every stored attribute value, the current ones and
// the replaced ones kept as history.
export interface GraphTotals {
  readonly entities: number;
  readonly relations: number;
  readonly attributes: number;
}

// Which entities of one type to list: the ones whose value matches `search` (no `search` means all) the way
// `match` says (`MatchMode`; by default `insensitive`: contains the text, ignoring case and accents),
// `limit` of them from position `offset`, ordered by value so that pages are stable.
export interface EntityListQuery {
  readonly type: string;
  readonly search?: string;
  readonly match?: MatchMode;
  readonly limit: number;
  readonly offset: number;
}

// One page of entities and how many entities matched in all, so a caller can tell whether there is
// another page.
export interface EntityPage {
  readonly total: number;
  readonly entities: readonly Entity[];
}
