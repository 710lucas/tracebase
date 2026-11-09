import { compareEntitiesByValue, type Entity } from "../../domain/entity/index.ts";
import { compareText } from "../../domain/text/index.ts";
import type { EntityTypeCount } from "./graph-overview.ts";
import type { ResolvedEntityQuery } from "./entity-query-options.ts";
import { InvalidEntityQueryError } from "./invalid-entity-query-error.ts";
import { createSnippet } from "./search-text.ts";

// Where an attribute condition of a structured query was met for an entity: in the attribute `name` (with its
// `qualifier`, when it has one), and `snippet` is the part of the value shown around the text. `history` is
// present, and true, only when the value is of a set that a newer one replaced (see `includeHistory`).
export interface QueryMatch {
  readonly name: string;
  readonly qualifier?: string;
  readonly snippet: string;
  readonly history?: true;
}

// An entity the query found and where its attribute conditions with text were met. An entity whose conditions
// have no text (only a name) is found with no matches.
export interface QueryResult {
  readonly entity: Entity;
  readonly matches: readonly QueryMatch[];
}

// The answer of a query in the mode `list`: one page of the entities ordered by value and then by type, so the
// order never changes and pages never overlap. `truncated` is true when more entities exist after this page,
// and then `nextOffset` is the `offset` of the next page. An `offset` past the end is refused, but a query
// that finds nothing is a normal, empty page.
export interface EntityQueryPage {
  readonly mode: "list";
  readonly limit: number;
  readonly offset: number;
  readonly snippetLength: number;
  readonly results: readonly QueryResult[];
  readonly truncated: boolean;
  readonly nextOffset?: number;
}

// The answer of a query in the mode `count`: how many entities it found and how many of each type, the type
// with the most entities first and, between types with as many, by name.
export interface EntityQueryCounts {
  readonly mode: "count";
  readonly total: number;
  readonly byType: readonly EntityTypeCount[];
}

export type EntityQueryAnswer = EntityQueryPage | EntityQueryCounts;

// Where a repository met an attribute condition: `condition` is the position of the condition in the query
// (`ResolvedEntityQuery.attributes`), which tells the text and the way it was compared, and `value` is the
// whole value that matched (the first one that does, in an attribute that has several).
export interface FoundQueryMatch {
  readonly condition: number;
  readonly name: string;
  readonly qualifier?: string;
  readonly value: string;
  readonly history?: boolean;
}

export interface FoundByQuery {
  readonly entity: Entity;
  readonly matches: readonly FoundQueryMatch[];
}

export interface EntityQueryPageParts {
  readonly query: ResolvedEntityQuery;
  // Every entity found, each once, in any order, with where its conditions were met.
  readonly found: readonly FoundByQuery[];
}

// Builds the `EntityQueryPage` that `GraphRepository.queryEntities` answers in the mode `list`, from what a
// repository found. It is the one place that knows the order, the page, how the matches of an entity are
// ordered and how the snippets are made, so every repository (memory, Memgraph) answers in the same way.
export function createEntityQueryPage(parts: EntityQueryPageParts): EntityQueryPage {
  const { query, found } = parts;
  const { limit, offset, snippetLength } = query;

  const ordered = [...found].sort((first, second) =>
    compareEntitiesByValue(first.entity, second.entity),
  );
  if (offset > 0 && ordered.length <= offset) {
    throw new InvalidEntityQueryError(
      `offset ${offset} is past the end: the query found ${ordered.length} entities`,
    );
  }

  const pageEnd = offset + limit;
  const truncated = ordered.length > pageEnd;

  return {
    mode: "list",
    limit,
    offset,
    snippetLength,
    results: ordered.slice(offset, pageEnd).map(({ entity, matches }) => ({
      entity,
      matches: [...matches].sort(compareMatches).map((match) => toQueryMatch(match, query)),
    })),
    truncated,
    ...(truncated && { nextOffset: pageEnd }),
  };
}

// Builds the `EntityQueryCounts` that `GraphRepository.queryEntities` answers in the mode `count`, from the
// entities a repository found (each once, in any order).
export function createEntityQueryCounts(entities: readonly Entity[]): EntityQueryCounts {
  const counts = new Map<string, number>();
  for (const { type } of entities) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return createEntityQueryCountsByType([...counts].map(([type, count]) => ({ type, count })));
}

// The same answer from counts that a database already grouped by type, one for each type, in any order.
export function createEntityQueryCountsByType(
  byType: readonly EntityTypeCount[],
): EntityQueryCounts {
  return {
    mode: "count",
    total: byType.reduce((total, { count }) => total + count, 0),
    byType: [...byType].sort(
      (first, second) => second.count - first.count || compareText(first.type, second.type),
    ),
  };
}

function toQueryMatch(match: FoundQueryMatch, query: ResolvedEntityQuery): QueryMatch {
  const condition = query.attributes[match.condition];
  const snippet =
    condition?.text === undefined
      ? match.value
      : createSnippet(match.value, condition.text, query.snippetLength, condition.match);

  return {
    name: match.name,
    ...(match.qualifier !== undefined && { qualifier: match.qualifier }),
    snippet,
    ...(match.history === true && { history: true as const }),
  };
}

// The attributes by name and by qualifier (none before any); for the same attribute the current values before
// the replaced ones, then by the position of the condition.
function compareMatches(first: FoundQueryMatch, second: FoundQueryMatch): number {
  return (
    compareText(first.name, second.name) ||
    compareText(first.qualifier ?? "", second.qualifier ?? "") ||
    Number(first.history === true) - Number(second.history === true) ||
    first.condition - second.condition
  );
}
