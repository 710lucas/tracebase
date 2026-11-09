import type { RequestHandler } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";
import {
  MATCH_MODES,
  SEARCH_SCOPES,
  type MatchMode,
  type SearchOptions,
  type SearchScope,
} from "../../../../core/ports/graph-repository/index.ts";

// Where this middleware leaves its result for the controller: `response.locals`. The value stored there
// is a `SearchRequest`.
export const SEARCH_REQUEST_KEY = "searchRequest";

export interface SearchRequest {
  text: string;
  options: SearchOptions;
}

// Middleware of the search route: `text` is required; `scope` is optional and is one of `SEARCH_SCOPES`;
// `match` is optional and is one of `MATCH_MODES` (how the text is compared with the values);
// `limit`, `offset`, `maxMatches` and `snippetLength` are optional and each must be a plain run of digits;
// every parameter is given once. If not, it answers 400 itself and the controller never runs. Whether the
// text has a character and whether a number is usable (`limit`, `maxMatches` and `snippetLength` from 1) is
// decided later by the core.
export const validateSearchRequest: RequestHandler = (request, response, next) => {
  const { text, scope, match, limit, offset, maxMatches, snippetLength } = request.query;

  // A parameter given twice (`text=a&text=b`) arrives as a list, which is not accepted.
  if (typeof text !== "string") {
    response
      .status(constants.HTTP_STATUS_BAD_REQUEST)
      .json({ error: "query parameter text is required" });
    return;
  }
  if (scope !== undefined && !SEARCH_SCOPES.includes(scope as SearchScope)) {
    response
      .status(constants.HTTP_STATUS_BAD_REQUEST)
      .json({ error: `scope is one of ${SEARCH_SCOPES.join(", ")}, given once` });
    return;
  }
  if (match !== undefined && !MATCH_MODES.includes(match as MatchMode)) {
    response
      .status(constants.HTTP_STATUS_BAD_REQUEST)
      .json({ error: `match is one of ${MATCH_MODES.join(", ")}, given once` });
    return;
  }

  const numbers = {
    limit: parseWholeNumber(limit),
    offset: parseWholeNumber(offset),
    maxMatches: parseWholeNumber(maxMatches),
    snippetLength: parseWholeNumber(snippetLength),
  };
  if (Object.values(numbers).some((number) => number === null)) {
    response.status(constants.HTTP_STATUS_BAD_REQUEST).json({
      error: "limit, offset, maxMatches and snippetLength are whole numbers, each given once",
    });
    return;
  }

  const searchRequest: SearchRequest = {
    text,
    options: {
      ...(scope !== undefined && { scope: scope as SearchScope }),
      ...(match !== undefined && { match: match as MatchMode }),
      ...(numbers.limit !== undefined && { limit: numbers.limit as number }),
      ...(numbers.offset !== undefined && { offset: numbers.offset as number }),
      ...(numbers.maxMatches !== undefined && { maxMatches: numbers.maxMatches as number }),
      ...(numbers.snippetLength !== undefined && {
        snippetLength: numbers.snippetLength as number,
      }),
    },
  };
  response.locals[SEARCH_REQUEST_KEY] = searchRequest;
  next();
};

// A missing parameter gives `undefined`; text that is not a plain run of digits (or a repeated
// parameter, which arrives as a list) gives `null`.
function parseWholeNumber(raw: unknown): number | undefined | null {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}
