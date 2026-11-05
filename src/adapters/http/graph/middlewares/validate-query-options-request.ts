import type { RequestHandler } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";
import type { QueryOptions } from "../../../../core/ports/graph-repository/index.ts";

// Where this middleware leaves its result for the controller: `response.locals`. The value stored there
// is a `QueryOptions`.
export const QUERY_OPTIONS_KEY = "queryOptions";

// Middleware of the routes that run a read with a time limit: `timeoutMs` is optional, a whole number
// of milliseconds from 1, given once. Without it the repository's default limit applies. If it is wrong
// it answers 400 itself and the controller never runs. It is a separate middleware so every such route
// asks for the limit in the same way.
export const validateQueryOptionsRequest: RequestHandler = (request, response, next) => {
  const { timeoutMs } = request.query;

  const queryOptions: QueryOptions = {};
  if (timeoutMs !== undefined) {
    const parsed = typeof timeoutMs === "string" && /^\d+$/.test(timeoutMs) ? Number(timeoutMs) : 0;
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      response
        .status(constants.HTTP_STATUS_BAD_REQUEST)
        .json({ error: "timeoutMs is a whole number of milliseconds from 1, given once" });
      return;
    }
    Object.assign(queryOptions, { timeoutMs: parsed });
  }

  response.locals[QUERY_OPTIONS_KEY] = queryOptions;
  next();
};
