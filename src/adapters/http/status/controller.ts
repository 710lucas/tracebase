import type { Request, Response } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";
import type { StatusService } from "./service.ts";

// Controller of the status route: translates HTTP into a call to the service and its report back into
// HTTP. A storage that does not answer is part of the report, not an error: the answer is still 200, so
// the screen can show what is wrong.
export function createStatusController(service: StatusService) {
  return {
    getStatus: async (_request: Request, response: Response): Promise<void> => {
      response.status(constants.HTTP_STATUS_OK).json(await service.getStatus());
    },
  };
}
