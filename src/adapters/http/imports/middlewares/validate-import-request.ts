import type { RequestHandler, Response } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";
import type { ZodError } from "zod";
import { importPayloadSchema } from "../import-payload-schema.ts";

// Where this middleware leaves its result for the controller: `response.locals`, Express's place for
// data passed along a request. The value stored there is an `ImportPayload`.
export const VALIDATED_PAYLOAD_KEY = "validatedPayload";

// Middleware of the import route: decides whether the body has the right shape, in order: is it JSON,
// does it have the right structure. If not, it answers 400 itself and the controller never runs. If
// so, it leaves the payload in `response.locals` and moves on. Whether the values are acceptable to
// the domain is checked later, when the service builds the domain objects.
//
// It is attached only to this route (see `router.ts`): each endpoint validates in its own way.
export const validateImportRequest: RequestHandler = (request, response, next) => {
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

  const schemaResult = importPayloadSchema.safeParse(parsedJson);
  if (!schemaResult.success) {
    respondInvalidPayload(response, schemaResult.error);
    return;
  }

  response.locals[VALIDATED_PAYLOAD_KEY] = schemaResult.data;
  next();
};

function respondBadRequest(response: Response, message: string): void {
  response.status(constants.HTTP_STATUS_BAD_REQUEST).json({ error: message });
}

function respondInvalidPayload(response: Response, schemaError: ZodError): void {
  const issues = schemaError.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  response.status(constants.HTTP_STATUS_BAD_REQUEST).json({ error: "invalid payload", issues });
}
