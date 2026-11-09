import { normalizeText } from "../../domain/text/index.ts";
import { InvalidSearchError } from "./invalid-search-error.ts";
import { DEFAULT_MATCH_MODE, MATCH_MODES, type MatchMode } from "./match-mode.ts";

// Where a search looks: only in the value of the entities (cheap), or also in the values of their current
// attributes (`full`, which reads much more of the graph).
export const SEARCH_SCOPES = ["entity-value", "full"] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

export const DEFAULT_SEARCH_SCOPE: SearchScope = "full";
export const DEFAULT_SEARCH_LIMIT = 50;
export const DEFAULT_SEARCH_OFFSET = 0;
// How many places an entity lists where the text was found; the rest is only counted.
export const DEFAULT_SEARCH_MAX_MATCHES = 100;
// How many characters of a value are shown around the text that was found.
export const DEFAULT_SEARCH_SNIPPET_LENGTH = 200;

// What a caller may choose about a search besides the text. All are optional and none has an upper limit,
// on purpose: the defaults are only what applies when the request says nothing, and the time limit
// (`QueryOptions`) is the safety net. `limit` is the size of a page of entities and `offset` how many to
// skip from the start of the ordered list.
export interface SearchOptions {
  readonly scope?: SearchScope;
  readonly match?: MatchMode;
  readonly limit?: number;
  readonly offset?: number;
  readonly maxMatches?: number;
  readonly snippetLength?: number;
}

export interface ResolvedSearch {
  // The text to look for, cleaned like an entity value (Unicode NFC, trimmed).
  readonly text: string;
  readonly scope: SearchScope;
  readonly match: MatchMode;
  readonly limit: number;
  readonly offset: number;
  readonly maxMatches: number;
  readonly snippetLength: number;
}

// Cleans the text, fills in the defaults and checks the values: the text must have at least one character
// once cleaned, the scope must be one of `SEARCH_SCOPES`, the match one of `MATCH_MODES`, `limit`, `maxMatches` and `snippetLength` whole
// numbers from 1 and `offset` a whole number from 0. It is the one place that knows these rules, so every
// repository (memory, Memgraph) accepts and refuses the same requests.
export function resolveSearch(text: string, options: SearchOptions = {}): ResolvedSearch {
  const cleanText = normalizeText(text);
  if (cleanText === "") {
    throw new InvalidSearchError("the text must have at least one character");
  }

  const scope = options.scope ?? DEFAULT_SEARCH_SCOPE;
  if (!SEARCH_SCOPES.includes(scope)) {
    throw new InvalidSearchError(`scope must be one of ${SEARCH_SCOPES.join(", ")}`);
  }

  const match = options.match ?? DEFAULT_MATCH_MODE;
  if (!MATCH_MODES.includes(match)) {
    throw new InvalidSearchError(`match must be one of ${MATCH_MODES.join(", ")}`);
  }

  const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;
  const maxMatches = options.maxMatches ?? DEFAULT_SEARCH_MAX_MATCHES;
  const snippetLength = options.snippetLength ?? DEFAULT_SEARCH_SNIPPET_LENGTH;
  const offset = options.offset ?? DEFAULT_SEARCH_OFFSET;

  for (const [name, value] of [
    ["limit", limit],
    ["maxMatches", maxMatches],
    ["snippetLength", snippetLength],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new InvalidSearchError(`${name} must be a whole number from 1`);
    }
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new InvalidSearchError("offset must be a whole number from 0");
  }

  return { text: cleanText, scope, match, limit, offset, maxMatches, snippetLength };
}
