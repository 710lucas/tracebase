import type { RequestHandler } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";
import {
  MATCH_MODES,
  type EntityListQuery,
  type MatchMode,
} from "../../../../core/ports/graph-repository/index.ts";

// Where this middleware leaves its result for the controller: `response.locals`. The value stored there
// is an `EntityListQuery`.
export const ENTITY_LIST_QUERY_KEY = "entityListQuery";

export const DEFAULT_LIST_LIMIT = 50;
// A page is capped so one request cannot ask for a whole large graph at once.
export const MAX_LIST_LIMIT = 200;

// Middleware of the entity list route (`/types/:type/entities`): the type comes from the path; `search`,
// `match`, `limit` and `offset` come from the query string and are all optional. `match` is one of
// `MATCH_MODES` (how `search` is compared with the values), `limit` a whole number from 1 to
// `MAX_LIST_LIMIT`, `offset` a whole number from 0, and each parameter may be given only once. If something
// is wrong it answers 400 itself and the controller never runs.
export const validateListEntitiesRequest: RequestHandler = (request, response, next) => {
  const { search, match, limit, offset } = request.query;
  const type = request.params["type"];

  const parsedLimit = parseWholeNumber(limit, DEFAULT_LIST_LIMIT);
  const parsedOffset = parseWholeNumber(offset, 0);

  if (
    typeof type !== "string" ||
    (search !== undefined && typeof search !== "string") ||
    (match !== undefined && !MATCH_MODES.includes(match as MatchMode)) ||
    parsedLimit === null ||
    parsedLimit < 1 ||
    parsedLimit > MAX_LIST_LIMIT ||
    parsedOffset === null
  ) {
    response.status(constants.HTTP_STATUS_BAD_REQUEST).json({
      error: `search is text, match is one of ${MATCH_MODES.join(", ")}, limit is a whole number from 1 to ${MAX_LIST_LIMIT} and offset a whole number from 0, each given once`,
    });
    return;
  }

  const entityListQuery: EntityListQuery = {
    type,
    ...(search !== undefined && search !== "" && { search }),
    ...(match !== undefined && { match: match as MatchMode }),
    limit: parsedLimit,
    offset: parsedOffset,
  };
  response.locals[ENTITY_LIST_QUERY_KEY] = entityListQuery;
  next();
};

// A missing parameter gives the default; text that is not a plain run of digits (or a repeated
// parameter, which arrives as a list) gives `null`.
function parseWholeNumber(raw: unknown, fallback: number): number | null {
  if (raw === undefined) return fallback;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}
