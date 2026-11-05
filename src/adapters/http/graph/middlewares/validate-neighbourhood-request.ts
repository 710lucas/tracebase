import type { RequestHandler } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";
import type { NeighbourhoodOptions } from "../../../../core/ports/graph-repository/index.ts";

// Where this middleware leaves its result for the controller: `response.locals`. The value stored there
// is a `NeighbourhoodRequest`.
export const NEIGHBOURHOOD_REQUEST_KEY = "neighbourhoodRequest";

// How much of each entity and relation the answer carries: `lean` (the default) is the shape of the
// neighbourhood; `full` adds the attributes of every entity and the provenance of every relation.
export type NeighbourhoodDetail = "lean" | "full";

export interface NeighbourhoodRequest {
  options: NeighbourhoodOptions;
  detail: NeighbourhoodDetail;
}

const DEFAULT_DETAIL: NeighbourhoodDetail = "lean";

// Middleware of the neighbourhood route: `hops` and `maxEntities` are optional and each must be a plain
// run of digits, given once; `detail` is optional and is `lean` or `full`, given once. If not, it answers
// 400 itself and the controller never runs. Whether a number is usable (from 1) is decided later by the
// core, when the repository resolves the options.
export const validateNeighbourhoodRequest: RequestHandler = (request, response, next) => {
  const { hops, maxEntities, detail } = request.query;

  const parsedHops = parseWholeNumber(hops);
  const parsedMaxEntities = parseWholeNumber(maxEntities);
  if (parsedHops === null || parsedMaxEntities === null) {
    response
      .status(constants.HTTP_STATUS_BAD_REQUEST)
      .json({ error: "hops and maxEntities are whole numbers, each given once" });
    return;
  }
  if (detail !== undefined && detail !== "lean" && detail !== "full") {
    response
      .status(constants.HTTP_STATUS_BAD_REQUEST)
      .json({ error: "detail is lean or full, given once" });
    return;
  }

  const neighbourhoodRequest: NeighbourhoodRequest = {
    options: {
      ...(parsedHops !== undefined && { hops: parsedHops }),
      ...(parsedMaxEntities !== undefined && { maxEntities: parsedMaxEntities }),
    },
    detail: detail ?? DEFAULT_DETAIL,
  };
  response.locals[NEIGHBOURHOOD_REQUEST_KEY] = neighbourhoodRequest;
  next();
};

// A missing parameter gives `undefined`; text that is not a plain run of digits (or a repeated
// parameter, which arrives as a list) gives `null`.
function parseWholeNumber(raw: unknown): number | undefined | null {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}
