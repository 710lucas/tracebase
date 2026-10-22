import type { Request, Response } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";
import { InvalidAttributeError } from "../../../core/domain/attribute/index.ts";
import { InvalidEntityError } from "../../../core/domain/entity/index.ts";
import { InvalidProvenanceError } from "../../../core/domain/provenance/index.ts";
import { InvalidRelationError } from "../../../core/domain/relation/index.ts";
import type { ImportPayloadDTO } from "./import-payload-schema.ts";
import * as service from "./service.ts";
import { VALIDATED_PAYLOAD_KEY } from "./middlewares/validate-import-request.ts";

// The errors the domain raises when a value is not acceptable (blank, out of range). They are the
// sender's mistake, so they become a 400 answer; any other error is ours and is left to Express (500).
const DOMAIN_VALIDATION_ERRORS = [
  InvalidAttributeError,
  InvalidEntityError,
  InvalidProvenanceError,
  InvalidRelationError,
];

// Controller of the imports routes: translates HTTP into a call to the service and the service's
// result (or error) back into HTTP. It holds no business rule.
//
// `importBatch`: what happens when a tool sends one import batch. By the time it runs, the
// `validateImportRequest` middleware has already rejected a body with the wrong shape and left the
// payload in `response.locals`.
export function importBatch(_request: Request, response: Response): void {
  const payload = response.locals[VALIDATED_PAYLOAD_KEY] as ImportPayloadDTO;
  try {
    const result = service.importBatch(payload);
    response.status(constants.HTTP_STATUS_ACCEPTED).json({ status: "accepted", ...result });
  } catch (error) {
    if (isDomainValidationError(error)) {
      response.status(constants.HTTP_STATUS_BAD_REQUEST).json({ error: error.message });
      return;
    }
    throw error;
  }
}

function isDomainValidationError(error: unknown): error is Error {
  return DOMAIN_VALIDATION_ERRORS.some((errorClass) => error instanceof errorClass);
}
