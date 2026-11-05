import type { RequestHandler } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";
import type { ShortestPathOptions } from "../../../../core/ports/graph-repository/index.ts";
import type { EntityQuery } from "./validate-find-entity-request.ts";

// Where this middleware leaves its result for the controller: `response.locals`. The value stored there
// is a `ShortestPathRequest`.
export const SHORTEST_PATH_REQUEST_KEY = "shortestPathRequest";

export interface ShortestPathRequest {
  from: EntityQuery;
  to: EntityQuery;
  options: ShortestPathOptions;
}

// Middleware of the shortest path route: `fromType`, `fromValue`, `toType` and `toValue` are required, each
// given once; `maxHops` is optional and must be a plain run of digits, given once. If not, it answers 400
// itself and the controller never runs. Whether the text is usable (not blank) and whether `maxHops` is
// usable (from 1) is decided later, by the domain and by the core.
export const validateShortestPathRequest: RequestHandler = (request, response, next) => {
  const { fromType, fromValue, toType, toValue, maxHops } = request.query;

  // A parameter given twice (`fromType=a&fromType=b`) arrives as a list, which is not accepted.
  if (
    typeof fromType !== "string" ||
    typeof fromValue !== "string" ||
    typeof toType !== "string" ||
    typeof toValue !== "string"
  ) {
    response
      .status(constants.HTTP_STATUS_BAD_REQUEST)
      .json({ error: "query parameters fromType, fromValue, toType and toValue are required" });
    return;
  }

  const parsedMaxHops = parseWholeNumber(maxHops);
  if (parsedMaxHops === null) {
    response
      .status(constants.HTTP_STATUS_BAD_REQUEST)
      .json({ error: "maxHops is a whole number, given once" });
    return;
  }

  const shortestPathRequest: ShortestPathRequest = {
    from: { type: fromType, value: fromValue },
    to: { type: toType, value: toValue },
    options: parsedMaxHops === undefined ? {} : { maxHops: parsedMaxHops },
  };
  response.locals[SHORTEST_PATH_REQUEST_KEY] = shortestPathRequest;
  next();
};

// A missing parameter gives `undefined`; text that is not a plain run of digits (or a repeated
// parameter, which arrives as a list) gives `null`.
function parseWholeNumber(raw: unknown): number | undefined | null {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}
