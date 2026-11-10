import type { RequestHandler } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";
import type { RunRef } from "../../../../core/ports/graph-repository/index.ts";

// Where this middleware leaves its result for the controller: `response.locals`. The value stored there is a
// `CompareRunsRequest`.
export const COMPARE_RUNS_REQUEST_KEY = "compareRunsRequest";

export const DEFAULT_COMPARE_LIMIT = 50;

export interface CompareRunsRequest {
  a: RunRef;
  b: RunRef;
  limit: number;
}

// Middleware of the comparison route: `aTool`, `aRun`, `bTool` and `bRun` are required, each given once and not
// blank; `limit` (how many entities to list in each group) is optional, a plain run of digits from 1, given once.
// If not, it answers 400 itself and the controller never runs.
export const validateCompareRunsRequest: RequestHandler = (request, response, next) => {
  const { aTool, aRun, bTool, bRun, limit } = request.query;

  const parts = [aTool, aRun, bTool, bRun];
  if (parts.some((part) => typeof part !== "string" || part.trim() === "")) {
    response
      .status(constants.HTTP_STATUS_BAD_REQUEST)
      .json({ error: "aTool, aRun, bTool and bRun are required, each given once and not blank" });
    return;
  }
  if (
    limit !== undefined &&
    (typeof limit !== "string" || !/^\d+$/.test(limit) || Number(limit) < 1)
  ) {
    response
      .status(constants.HTTP_STATUS_BAD_REQUEST)
      .json({ error: "limit is a whole number from 1, given once" });
    return;
  }

  const compareRunsRequest: CompareRunsRequest = {
    a: { tool: aTool as string, run: aRun as string },
    b: { tool: bTool as string, run: bRun as string },
    limit: limit === undefined ? DEFAULT_COMPARE_LIMIT : Number(limit),
  };
  response.locals[COMPARE_RUNS_REQUEST_KEY] = compareRunsRequest;
  next();
};
