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

// Middleware of the neighbourhood route: `hops`, `maxEntities` and `offset` are optional and each must be a
// plain run of digits, given once; `detail` is optional and is `lean` or `full`, given once. If not, it answers
// 400 itself and the controller never runs. Whether a number is usable (`hops` and `maxEntities` from 1) and whether the
// `offset` is not past the end are decided later by the core, when the repository resolves the options.
export const validateNeighbourhoodRequest: RequestHandler = (request, response, next) => {
  const { hops, maxEntities, offset, detail } = request.query;

  const parsedHops = parseWholeNumber(hops);
  const parsedMaxEntities = parseWholeNumber(maxEntities);
  const parsedOffset = parseWholeNumber(offset);
  if (parsedHops === null || parsedMaxEntities === null || parsedOffset === null) {
    response
      .status(constants.HTTP_STATUS_BAD_REQUEST)
      .json({ error: "hops, maxEntities and offset are whole numbers, each given once" });
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
      ...(parsedOffset !== undefined && { offset: parsedOffset }),
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
