import { normalizeText } from "../../domain/text/index.ts";
import { InvalidEntityQueryError } from "./invalid-entity-query-error.ts";
import { DEFAULT_MATCH_MODE, MATCH_MODES, type MatchMode } from "./match-mode.ts";

// What a structured query answers: the entities themselves (`list`, a page of them) or only how many there
// are (`count`, the total and the count by type).
export const QUERY_MODES = ["list", "count"] as const;
export type QueryMode = (typeof QUERY_MODES)[number];

export const DEFAULT_QUERY_MODE: QueryMode = "list";
export const DEFAULT_ENTITY_QUERY_LIMIT = 50;
export const DEFAULT_ENTITY_QUERY_OFFSET = 0;
// How many characters of an attribute value are shown around the text that was found.
export const DEFAULT_ENTITY_QUERY_SNIPPET_LENGTH = 200;

// A condition on the value of the entity: it must match `text` the way `match` says.
export interface ValueCondition {
  readonly text: string;
  readonly match?: MatchMode;
}

// A condition on one attribute of the entity: it has an attribute called `name` (with this `qualifier`, when
// given) and, when `text` is given, one of its values matches the text the way `match` says.
export interface AttributeCondition {
  readonly name: string;
  readonly qualifier?: string;
  readonly text?: string;
  readonly match?: MatchMode;
}

// The entity is mentioned by at least one relation or attribute seen by this tool, module or run. At least one
// of the three must be given.
export interface ProvenanceFilter {
  readonly tool?: string;
  readonly module?: string;
  readonly run?: string;
}

// What a caller may ask in a structured query. Every field is optional and the conditions are ANDed; `types`
// is a list of which any one is enough. With no condition at all the query is the whole graph. None of the
// numbers has an upper limit, on purpose: the defaults are only what applies when the request says nothing,
// and the time limit (`QueryOptions`) is the safety net. `limit` and `offset` are for `list` and are ignored by
// `count`. `includeHistory` makes the attribute conditions look also at the sets that were replaced by newer
// ones, not only at the current values. `snippetLength` is how many characters of a value are shown around
// the text that an attribute condition found.
export interface EntityQuery {
  readonly types?: readonly string[];
  readonly value?: ValueCondition;
  readonly attributes?: readonly AttributeCondition[];
  readonly provenance?: ProvenanceFilter;
  readonly includeHistory?: boolean;
  readonly mode?: QueryMode;
  readonly limit?: number;
  readonly offset?: number;
  readonly snippetLength?: number;
}

export interface ResolvedValueCondition {
  readonly text: string;
  readonly match: MatchMode;
}

export interface ResolvedAttributeCondition {
  readonly name: string;
  readonly qualifier?: string;
  readonly text?: string;
  readonly match: MatchMode;
}

export interface ResolvedEntityQuery {
  readonly types?: readonly string[];
  readonly value?: ResolvedValueCondition;
  readonly attributes: readonly ResolvedAttributeCondition[];
  readonly provenance?: ProvenanceFilter;
  readonly includeHistory: boolean;
  readonly mode: QueryMode;
  readonly limit: number;
  readonly offset: number;
  readonly snippetLength: number;
}

// Cleans the texts like an entity (Unicode NFC, trimmed), fills in the defaults and checks the query, so every
// repository (memory, Memgraph) accepts and refuses the same requests. Refused: an empty list of types or a
// blank type, a value condition without text, an attribute condition without a name or with a blank qualifier
// or text, a provenance filter with none of tool, module and run (or with a blank one), a `match` or `mode`
// that does not exist, a `limit` or `snippetLength` that is not a whole number from 1 and an `offset` that is
// not a whole number from 0.
export function resolveEntityQuery(query: EntityQuery = {}): ResolvedEntityQuery {
  const mode = query.mode ?? DEFAULT_QUERY_MODE;
  if (!QUERY_MODES.includes(mode)) {
    throw new InvalidEntityQueryError(`mode must be one of ${QUERY_MODES.join(", ")}`);
  }

  const limit = query.limit ?? DEFAULT_ENTITY_QUERY_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new InvalidEntityQueryError("limit must be a whole number from 1");
  }
  const snippetLength = query.snippetLength ?? DEFAULT_ENTITY_QUERY_SNIPPET_LENGTH;
  if (!Number.isSafeInteger(snippetLength) || snippetLength < 1) {
    throw new InvalidEntityQueryError("snippetLength must be a whole number from 1");
  }
  const offset = query.offset ?? DEFAULT_ENTITY_QUERY_OFFSET;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new InvalidEntityQueryError("offset must be a whole number from 0");
  }

  const types = query.types === undefined ? undefined : resolveTypes(query.types);
  const value = query.value === undefined ? undefined : resolveValueCondition(query.value);
  const attributes = (query.attributes ?? []).map(resolveAttributeCondition);
  const provenance =
    query.provenance === undefined ? undefined : resolveProvenance(query.provenance);

  return {
    ...(types !== undefined && { types }),
    ...(value !== undefined && { value }),
    attributes,
    ...(provenance !== undefined && { provenance }),
    includeHistory: query.includeHistory ?? false,
    mode,
    limit,
    offset,
    snippetLength,
  };
}

function resolveTypes(types: readonly string[]): readonly string[] {
  if (types.length === 0) {
    throw new InvalidEntityQueryError(
      "types must have at least one type (leave it out for any type)",
    );
  }
  return types.map((type) => requireText(type, "a type"));
}

function resolveValueCondition(condition: ValueCondition): ResolvedValueCondition {
  return {
    text: requireText(condition.text, "the text of the value"),
    match: resolveMatch(condition.match),
  };
}

function resolveAttributeCondition(condition: AttributeCondition): ResolvedAttributeCondition {
  return {
    name: requireText(condition.name, "the name of an attribute"),
    ...(condition.qualifier !== undefined && {
      qualifier: requireText(condition.qualifier, "the qualifier of an attribute"),
    }),
    ...(condition.text !== undefined && {
      text: requireText(condition.text, "the text of an attribute"),
    }),
    match: resolveMatch(condition.match),
  };
}

function resolveProvenance(filter: ProvenanceFilter): ProvenanceFilter {
  const { tool, module, run } = filter;
  if (tool === undefined && module === undefined && run === undefined) {
    throw new InvalidEntityQueryError("provenance needs at least one of tool, module and run");
  }
  return {
    ...(tool !== undefined && { tool: requireText(tool, "the tool of the provenance") }),
    ...(module !== undefined && { module: requireText(module, "the module of the provenance") }),
    ...(run !== undefined && { run: requireText(run, "the run of the provenance") }),
  };
}

function resolveMatch(match: MatchMode | undefined): MatchMode {
  const resolved = match ?? DEFAULT_MATCH_MODE;
  if (!MATCH_MODES.includes(resolved)) {
    throw new InvalidEntityQueryError(`match must be one of ${MATCH_MODES.join(", ")}`);
  }
  return resolved;
}

function requireText(text: string, what: string): string {
  const cleanText = normalizeText(text);
  if (cleanText === "") {
    throw new InvalidEntityQueryError(`${what} must have at least one character`);
  }
  return cleanText;
}
