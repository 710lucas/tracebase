import type { Attribute } from "../../domain/attribute/index.ts";
import type { Entity } from "../../domain/entity/index.ts";
import type { Relation } from "../../domain/relation/index.ts";
import type { EntityDegree } from "./entity-degree.ts";
import type { EntityNeighbourhood } from "./entity-neighbourhood.ts";
import type { NeighbourhoodOptions } from "./neighbourhood-options.ts";
import type { EntityQuery } from "./entity-query-options.ts";
import type { EntityQueryAnswer } from "./entity-query-result.ts";
import type { EntitySearchPage } from "./entity-search.ts";
import type { SearchOptions } from "./search-options.ts";
import type { ShortestPath } from "./shortest-path.ts";
import type { ShortestPathOptions } from "./shortest-path-options.ts";
import type {
  EntityListQuery,
  EntityPage,
  EntityTypeCount,
  GraphTotals,
  RunSummary,
} from "./graph-overview.ts";

// How long a read of the graph may take when the caller does not say (30 seconds).
export const DEFAULT_QUERY_TIMEOUT_MS = 30_000;

// What a caller may ask of a read of the graph besides the question itself. `timeoutMs` is how long the
// read may take; when it takes longer it is cancelled and fails with `QueryTimeoutError`, never with a
// partial answer. There is no upper limit on purpose: the caller chooses how much to wait.
export interface QueryOptions {
  readonly timeoutMs?: number;
}

// What one import brings: the relations and the attributes found by one run of one tool. Both are
// validated models, so a repository never has to check them again.
export interface ImportBatch {
  readonly relations: readonly Relation[];
  readonly attributes: readonly Attribute[];
}

// Everything the graph holds about one entity: the relations where it is the source or the target,
// and its attributes, each with its own provenance. The same fact seen by two runs appears twice.
export interface EntityFindings {
  readonly entity: Entity;
  readonly relations: readonly Relation[];
  readonly attributes: readonly Attribute[];
}

// Where the knowledge graph is kept, as the core sees it: it says WHAT must be stored and read, never
// HOW. An in-memory list and a Memgraph database both fit behind this; the code that uses it cannot
// tell them apart.
//
// `save` and `findEntity` are asynchronous because a real database answers later; an in-memory
// repository simply returns an already finished promise.
//
// `findEntity` answers `null` when no relation and no attribute mentions the entity: an entity only
// exists in the graph because something mentions it. Two entities are the same when type and value
// are equal, so callers build the `Entity` with `createEntity`, which normalizes both.
//
// EXPAND: the idempotent-write key (so importing the same run twice does not duplicate) belongs to the
// Memgraph adapter step.
//
// The other four read the graph as a whole (see `graph-overview.ts`): the runs that were imported, the
// entity types with their counts, a page of the entities of one type, and the size of the graph.
//
// `getEntityDegree` is the first of the questions an AI asks about one entity (see `entity-degree.ts`):
// how many relations it has, in each direction and by the type of the neighbour. Like `findEntity`, it
// answers `null` when nothing mentions the entity; an entity that only has attributes has degree zero.
// It takes `QueryOptions`; a repository whose reads cannot run long, such as the in-memory one, may
// ignore the time limit.
//
// `getEntityNeighbourhood` is the second one (see `entity-neighbourhood.ts`): the entities within some
// relations of one entity, with the relations between them and their current attributes. Same `null`
// rule. `hops` and `maxEntities` have defaults and no upper limit; when more entities exist than
// `maxEntities` the answer is cut and says so (`truncated`). Invalid hops or maxEntities fail with
// `InvalidNeighbourhoodOptionsError`.
//
// `getShortestPath` is the third (see `shortest-path.ts`): the path with the fewest relations between two
// entities, walking the relations in either direction, up to `maxHops` (default 6, no upper limit). It
// answers `null` when either entity is not in the graph, and an empty path (not an error) when both are but
// no path exists within `maxHops`. Among paths of the same length the answer is always the same one. An
// invalid `maxHops` fails with `InvalidShortestPathOptionsError`.
//
// `searchEntities` is the fourth (see `entity-search.ts`): the entities whose value, or whose current
// attribute values (scope `full`, the default), contain a text, ignoring case. It answers one page of
// results, each with where it matched and a snippet, with `limit` (default 50), `offset`, `maxMatches` per
// entity (default 100) and `snippetLength` (default 200) changeable per call. It never answers `null`: a
// search that finds nothing is an empty page. A text without a character, an unknown scope or a number that
// makes no sense fail with `InvalidSearchError`, and so does an `offset` past the end of the results.
//
// `queryEntities` is the fifth (see `entity-query-options.ts` and `entity-query-result.ts`): the entities that
// meet ALL the conditions of a structured query (types, a condition on the value, conditions on attributes,
// a provenance filter; none at all is the whole graph). In the mode `list` (the default) it answers one page
// ordered by value and then by type, with the snippets of the attribute conditions that have a text; in the
// mode `count`, the total and the count by type. `limit` (default 50), `offset`, `snippetLength` (default
// 200) and `includeHistory` are changeable per call. A query that finds nothing is an empty page or a zero
// count. A query that makes no sense fails with `InvalidEntityQueryError`, and so does an `offset` past the
// end of the results.
export interface GraphRepository {
  save(batch: ImportBatch): Promise<void>;
  findEntity(entity: Entity): Promise<EntityFindings | null>;
  listRuns(): Promise<RunSummary[]>;
  listEntityTypes(): Promise<EntityTypeCount[]>;
  listEntities(query: EntityListQuery): Promise<EntityPage>;
  graphTotals(): Promise<GraphTotals>;
  getEntityDegree(entity: Entity, options?: QueryOptions): Promise<EntityDegree | null>;
  getEntityNeighbourhood(
    entity: Entity,
    options?: QueryOptions & NeighbourhoodOptions,
  ): Promise<EntityNeighbourhood | null>;
  getShortestPath(
    from: Entity,
    to: Entity,
    options?: QueryOptions & ShortestPathOptions,
  ): Promise<ShortestPath | null>;
  searchEntities(text: string, options?: QueryOptions & SearchOptions): Promise<EntitySearchPage>;
  queryEntities(query?: EntityQuery, options?: QueryOptions): Promise<EntityQueryAnswer>;
}
