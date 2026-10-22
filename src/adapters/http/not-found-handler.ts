import type { Request, Response } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";

// Last handler in the chain: reached only by a path no route claimed. Express would answer with an
// HTML page; the API speaks JSON everywhere.
export function notFoundHandler(_request: Request, response: Response): void {
  response.status(constants.HTTP_STATUS_NOT_FOUND).json({ error: "not found" });
}
