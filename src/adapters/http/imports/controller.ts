import type { Request, Response } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";
import type { ImportPayloadDTO } from "./import-payload-schema.ts";
import { InvalidImportItemError } from "./invalid-import-item-error.ts";
import { isDomainValidationError } from "./is-domain-validation-error.ts";
import type { ImportsService } from "./service.ts";
import { VALIDATED_PAYLOAD_KEY } from "./middlewares/validate-import-request.ts";

// Controller of the imports routes: translates HTTP into a call to the service and the service's
// result (or error) back into HTTP. It holds no business rule.
//
// `importBatch`: what happens when a tool sends one import batch. By the time it runs, the
// `validateImportRequest` middleware has already rejected a body with the wrong shape and left the
// payload in `response.locals`. A value the domain rejects is a 400: when it belongs to one item, the
// answer says which one, in the same form as the structure errors (`issues` with a `path`); any other
// error is ours and is left to Express (500).
export function createImportsController(service: ImportsService) {
  return {
    importBatch: async (_request: Request, response: Response): Promise<void> => {
      const payload = response.locals[VALIDATED_PAYLOAD_KEY] as ImportPayloadDTO;
      try {
        const result = await service.importBatch(payload);
        response.status(constants.HTTP_STATUS_ACCEPTED).json({ status: "accepted", ...result });
      } catch (error) {
        if (error instanceof InvalidImportItemError) {
          response.status(constants.HTTP_STATUS_BAD_REQUEST).json({
            error: "invalid payload",
            issues: [{ path: error.path, message: error.message }],
          });
          return;
        }
        if (isDomainValidationError(error)) {
          response.status(constants.HTTP_STATUS_BAD_REQUEST).json({ error: error.message });
          return;
        }
        throw error;
      }
    },

    // What has been imported so far: one entry per run. No input to validate.
    listRuns: async (_request: Request, response: Response): Promise<void> => {
      response.status(constants.HTTP_STATUS_OK).json({ runs: await service.listRuns() });
    },
  };
}
