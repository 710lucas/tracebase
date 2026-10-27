import type { RequestHandler } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";

// Where this middleware leaves its result for the controller: `response.locals`. The value stored there
// is an `EntityQuery`.
export const ENTITY_QUERY_KEY = "entityQuery";

export interface EntityQuery {
  type: string;
  value: string;
}

// Middleware of the entity lookup route: both `type` and `value` must be in the query string, each
// given once. If not, it answers 400 itself and the controller never runs. Whether the text is usable
// (not blank) is decided later by the domain, when the service builds the entity.
//
// It is attached only to this route (see `router.ts`): each endpoint validates in its own way.
export const validateFindEntityRequest: RequestHandler = (request, response, next) => {
  const { type, value } = request.query;
  // A parameter given twice (`type=a&type=b`) arrives as a list, which is not accepted.
  if (typeof type !== "string" || typeof value !== "string") {
    response
      .status(constants.HTTP_STATUS_BAD_REQUEST)
      .json({ error: "query parameters type and value are required" });
    return;
  }

  const entityQuery: EntityQuery = { type, value };
  response.locals[ENTITY_QUERY_KEY] = entityQuery;
  next();
};
