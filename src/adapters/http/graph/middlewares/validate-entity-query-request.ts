import type { RequestHandler, Response } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";
import type { ZodError } from "zod";
import type { EntityQuery, QueryOptions } from "../../../../core/ports/graph-repository/index.ts";
import { entityQuerySchema } from "../entity-query-schema.ts";

// Where this middleware leaves its result for the controller: `response.locals`. The value stored there is an
// `EntityQueryRequest`.
export const ENTITY_QUERY_REQUEST_KEY = "entityQueryRequest";

export interface EntityQueryRequest {
  query: EntityQuery;
  options: QueryOptions;
}

// Middleware of the structured query route: decides whether the body has the right shape, in order: is it JSON,
// does it have the right structure (fields we know, with the right types). If not, it answers 400 itself and
// the controller never runs. If so, it leaves the query and the time limit in `response.locals`. Whether the
// values make sense (a blank text, a `limit` below 1) is decided later by the core.
export const validateEntityQueryRequest: RequestHandler = (request, response, next) => {
  // `express.text` leaves the body undefined when there was none or the Content-Type was not JSON.
  if (typeof request.body !== "string") {
    respondBadRequest(response, "expected a JSON body with Content-Type: application/json");
    return;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(request.body);
  } catch {
    respondBadRequest(response, "invalid JSON");
    return;
  }

  const schemaResult = entityQuerySchema.safeParse(parsedJson);
  if (!schemaResult.success) {
    respondInvalidQuery(response, schemaResult.error);
    return;
  }

  const { timeoutMs, ...query } = schemaResult.data;
  // A field the body does not have is absent from `query` (JSON has no `undefined`), which is what the
  // optional fields of `EntityQuery` mean.
  const entityQueryRequest: EntityQueryRequest = {
    query: query as EntityQuery,
    options: timeoutMs === undefined ? {} : { timeoutMs },
  };
  response.locals[ENTITY_QUERY_REQUEST_KEY] = entityQueryRequest;
  next();
};

function respondBadRequest(response: Response, message: string): void {
  response.status(constants.HTTP_STATUS_BAD_REQUEST).json({ error: message });
}

function respondInvalidQuery(response: Response, schemaError: ZodError): void {
  const issues = schemaError.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  response.status(constants.HTTP_STATUS_BAD_REQUEST).json({ error: "invalid query", issues });
}
