import type { RequestHandler } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";
import type { NeighbourhoodOptions } from "../../../../core/ports/graph-repository/index.ts";

// Where this middleware leaves its result for the controller: `response.locals`. The value stored there
// is a `NeighbourhoodOptions`.
export const NEIGHBOURHOOD_OPTIONS_KEY = "neighbourhoodOptions";

// Middleware of the neighbourhood route: `hops` and `maxEntities` are optional and each must be a plain
// run of digits, given once. If not, it answers 400 itself and the controller never runs. Whether the
// number is usable (from 1) is decided later by the core, when the repository resolves the options.
export const validateNeighbourhoodRequest: RequestHandler = (request, response, next) => {
  const { hops, maxEntities } = request.query;

  const parsedHops = parseWholeNumber(hops);
  const parsedMaxEntities = parseWholeNumber(maxEntities);
  if (parsedHops === null || parsedMaxEntities === null) {
    response
      .status(constants.HTTP_STATUS_BAD_REQUEST)
      .json({ error: "hops and maxEntities are whole numbers, each given once" });
    return;
  }

  const neighbourhoodOptions: NeighbourhoodOptions = {
    ...(parsedHops !== undefined && { hops: parsedHops }),
    ...(parsedMaxEntities !== undefined && { maxEntities: parsedMaxEntities }),
  };
  response.locals[NEIGHBOURHOOD_OPTIONS_KEY] = neighbourhoodOptions;
  next();
};

// A missing parameter gives `undefined`; text that is not a plain run of digits (or a repeated
// parameter, which arrives as a list) gives `null`.
function parseWholeNumber(raw: unknown): number | undefined | null {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}
