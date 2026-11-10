import type { RequestHandler } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";
import type { MostConnectedOptions } from "../../../../core/ports/graph-repository/index.ts";

// Where this middleware leaves its result for the controller: `response.locals`. The value stored there
// is a `MostConnectedOptions`.
export const MOST_CONNECTED_OPTIONS_KEY = "mostConnectedOptions";

// Middleware of the most-connected route: `limit` is optional and must be a plain run of digits, given once.
// If not, it answers 400 itself and the controller never runs. Whether the number is usable (from 1) is decided
// later by the core, when the repository resolves the options.
export const validateMostConnectedRequest: RequestHandler = (request, response, next) => {
  const { limit } = request.query;

  if (limit !== undefined && (typeof limit !== "string" || !/^\d+$/.test(limit))) {
    response
      .status(constants.HTTP_STATUS_BAD_REQUEST)
      .json({ error: "limit is a whole number, given once" });
    return;
  }

  const options: MostConnectedOptions = limit === undefined ? {} : { limit: Number(limit) };
  response.locals[MOST_CONNECTED_OPTIONS_KEY] = options;
  next();
};
