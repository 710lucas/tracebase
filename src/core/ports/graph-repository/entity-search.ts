import { compareEntitiesByValue, type Entity } from "../../domain/entity/index.ts";
import { compareText } from "../../domain/text/index.ts";
import { InvalidSearchError } from "./invalid-search-error.ts";
import type { ResolvedSearch, SearchScope } from "./search-options.ts";
import type { MatchMode } from "./match-mode.ts";
import { createSnippet } from "./search-text.ts";

// One place where the searched text was found for an entity: in its value (`entity-value`), or in the
// values of one of its current attributes (`attribute`, with the `name` and, when the attribute has one,
// the `qualifier`). `snippet` is the part of the value shown around the text.
export interface SearchMatch {
  readonly where: "entity-value" | "attribute";
  readonly name?: string;
  readonly qualifier?: string;
  readonly snippet: string;
}

// An entity the search found and where it matched. An entity that matches in several places is one result
// with several matches: the value of the entity first, then its attributes ordered by name and qualifier.
// At most `maxMatches` are listed and `moreMatches` says how many were left out (it is absent when none).
export interface SearchResult {
  readonly entity: Entity;
  readonly matches: readonly SearchMatch[];
  readonly moreMatches?: number;
}

// One page of the results of a search. The results are ordered with the entities whose VALUE matches first,
// then the ones that only match in an attribute, and inside each group by value and then by type, so the
// order never changes and pages never overlap. `truncated` is true when more results exist after this page,
// and then `nextOffset` is the `offset` of the next page. An `offset` past the end of the results is refused,
// but a search that finds nothing is a normal, empty page.
export interface EntitySearchPage {
  readonly text: string;
  readonly scope: SearchScope;
  readonly match: MatchMode;
  readonly limit: number;
  readonly offset: number;
  readonly maxMatches: number;
  readonly snippetLength: number;
  readonly results: readonly SearchResult[];
  readonly truncated: boolean;
  readonly nextOffset?: number;
}

// Where an entity matched, as a repository finds it: `value` is the whole text that matched, the value of the
// entity or the first value of the attribute that contains the searched text.
export interface FoundMatch {
  readonly where: "entity-value" | "attribute";
  readonly name?: string;
  readonly qualifier?: string;
  readonly value: string;
}

export interface FoundEntity {
  readonly entity: Entity;
  readonly matches: readonly FoundMatch[];
}

export interface EntitySearchParts {
  readonly search: ResolvedSearch;
  // Every entity found, each once, in any order (a repository that already knows only the first
  // `offset + limit + 1` in the order of the page matter may bring just those), with all its matches.
  readonly found: readonly FoundEntity[];
}

// Builds the `EntitySearchPage` that `GraphRepository.searchEntities` answers, from what a repository
// found. It is the one place that knows the order, the page, how the matches of an entity are listed and cut
// and how the snippets are made, so every repository (memory, Memgraph) answers in the same way.
export function createEntitySearchPage(parts: EntitySearchParts): EntitySearchPage {
  const { search } = parts;
  const { limit, offset, maxMatches, snippetLength } = search;

  const ordered = parts.found
    .map((found) => ({
      found,
      matchesValue: found.matches.some(({ where }) => where === "entity-value"),
    }))
    .sort(
      (first, second) =>
        Number(second.matchesValue) - Number(first.matchesValue) ||
        compareEntitiesByValue(first.found.entity, second.found.entity),
    );
  if (offset > 0 && ordered.length <= offset) {
    throw new InvalidSearchError(
      `offset ${offset} is past the end: the search found ${ordered.length} entities`,
    );
  }

  const pageEnd = offset + limit;
  const truncated = ordered.length > pageEnd;

  return {
    text: search.text,
    scope: search.scope,
    match: search.match,
    limit,
    offset,
    maxMatches,
    snippetLength,
    results: ordered.slice(offset, pageEnd).map(({ found }) => {
      const matches = [...found.matches].sort(compareMatches);
      const listed = matches.slice(0, maxMatches);
      return {
        entity: found.entity,
        matches: listed.map(({ where, name, qualifier, value }) => ({
          where,
          ...(name !== undefined && { name }),
          ...(qualifier !== undefined && { qualifier }),
          snippet: createSnippet(value, search.text, snippetLength, search.match),
        })),
        ...(matches.length > listed.length && { moreMatches: matches.length - listed.length }),
      };
    }),
    truncated,
    ...(truncated && { nextOffset: pageEnd }),
  };
}

// The value of the entity first; then the attributes by name and by qualifier (none before any).
function compareMatches(first: FoundMatch, second: FoundMatch): number {
  if (first.where !== second.where) return first.where === "entity-value" ? -1 : 1;
  return (
    compareText(first.name ?? "", second.name ?? "") ||
    compareText(first.qualifier ?? "", second.qualifier ?? "")
  );
}
