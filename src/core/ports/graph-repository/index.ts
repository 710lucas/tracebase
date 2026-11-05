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
export { createRunSummaries } from "./run-summaries.ts";
export type { RunItemKind, RunSummaries } from "./run-summaries.ts";
export type {
  EntityListQuery,
  EntityPage,
  EntityTypeCount,
  GraphTotals,
  RunSummary,
} from "./graph-overview.ts";
