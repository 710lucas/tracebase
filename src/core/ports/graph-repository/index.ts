// Public API of the `graph-repository` module.
export { DEFAULT_QUERY_TIMEOUT_MS } from "./graph-repository.ts";
export type {
  EntityFindings,
  GraphRepository,
  ImportBatch,
  QueryOptions,
} from "./graph-repository.ts";
export { QueryTimeoutError } from "./query-timeout-error.ts";
export { createEntityDegree } from "./entity-degree.ts";
export type { EntityDegree, NeighbourTypeCount } from "./entity-degree.ts";
export { createEntityNeighbourhood } from "./entity-neighbourhood.ts";
export type {
  EntityNeighbourhood,
  NeighbourhoodEntity,
  NeighbourhoodParts,
  ReachedEntity,
} from "./entity-neighbourhood.ts";
export {
  DEFAULT_NEIGHBOURHOOD_HOPS,
  DEFAULT_NEIGHBOURHOOD_MAX_ENTITIES,
  DEFAULT_NEIGHBOURHOOD_OFFSET,
  resolveNeighbourhoodOptions,
} from "./neighbourhood-options.ts";
export type {
  NeighbourhoodOptions,
  ResolvedNeighbourhoodOptions,
} from "./neighbourhood-options.ts";
export { InvalidNeighbourhoodOptionsError } from "./invalid-neighbourhood-options-error.ts";
export { chooseFixedPath, createShortestPath } from "./shortest-path.ts";
export type {
  FixedPathSearch,
  PathStep,
  ShortestPath,
  ShortestPathParts,
} from "./shortest-path.ts";
export {
  DEFAULT_SHORTEST_PATH_MAX_HOPS,
  resolveShortestPathOptions,
} from "./shortest-path-options.ts";
export type { ResolvedShortestPathOptions, ShortestPathOptions } from "./shortest-path-options.ts";
export { InvalidShortestPathOptionsError } from "./invalid-shortest-path-options-error.ts";
export {
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_SEARCH_MAX_MATCHES,
  DEFAULT_SEARCH_OFFSET,
  DEFAULT_SEARCH_SCOPE,
  DEFAULT_SEARCH_SNIPPET_LENGTH,
  SEARCH_SCOPES,
  resolveSearch,
} from "./search-options.ts";
export type { ResolvedSearch, SearchOptions, SearchScope } from "./search-options.ts";
export {
  DEFAULT_ENTITY_QUERY_LIMIT,
  DEFAULT_ENTITY_QUERY_OFFSET,
  DEFAULT_ENTITY_QUERY_SNIPPET_LENGTH,
  DEFAULT_QUERY_MODE,
  QUERY_MODES,
  resolveEntityQuery,
} from "./entity-query-options.ts";
export type {
  AttributeCondition,
  EntityQuery,
  ProvenanceFilter,
  QueryMode,
  ResolvedAttributeCondition,
  ResolvedEntityQuery,
  ResolvedValueCondition,
  ValueCondition,
} from "./entity-query-options.ts";
export { InvalidEntityQueryError } from "./invalid-entity-query-error.ts";
export {
  createEntityQueryCounts,
  createEntityQueryCountsByType,
  createEntityQueryPage,
} from "./entity-query-result.ts";
export type {
  EntityQueryAnswer,
  EntityQueryCounts,
  EntityQueryPage,
  EntityQueryPageParts,
  FoundByQuery,
  FoundQueryMatch,
  QueryMatch,
  QueryResult,
} from "./entity-query-result.ts";
export { toLeanNeighbourhood } from "./lean-neighbourhood.ts";
export type { LeanNeighbourhood } from "./lean-neighbourhood.ts";
export { DEFAULT_MATCH_MODE, MATCH_MODES } from "./match-mode.ts";
export type { MatchMode } from "./match-mode.ts";
export { createEntitySearchPage } from "./entity-search.ts";
export type {
  EntitySearchPage,
  EntitySearchParts,
  FoundEntity,
  FoundMatch,
  SearchMatch,
  SearchResult,
} from "./entity-search.ts";
export { InvalidSearchError } from "./invalid-search-error.ts";
export { createSnippet, indexOfText } from "./search-text.ts";
export { createRunSummaries } from "./run-summaries.ts";
export type { RunItemKind, RunSummaries } from "./run-summaries.ts";
export type {
  EntityListQuery,
  EntityPage,
  EntityTypeCount,
  GraphTotals,
  RunSummary,
} from "./graph-overview.ts";
export { InvalidMostConnectedError } from "./invalid-most-connected-error.ts";
export {
  DEFAULT_MOST_CONNECTED_LIMIT,
  resolveMostConnectedOptions,
} from "./most-connected-options.ts";
export type {
  MostConnectedOptions,
  ResolvedMostConnectedOptions,
} from "./most-connected-options.ts";
export { rankMostConnected } from "./most-connected.ts";
export type { ConnectedEntity } from "./most-connected.ts";
export { createRunComparison } from "./run-comparison.ts";
export type { ComparedEntities, RunComparison, RunRef } from "./run-comparison.ts";
