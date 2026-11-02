import type { Request, Response } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";
import { InvalidEntityError } from "../../../core/domain/entity/index.ts";
import type { EntityListQuery } from "../../../core/ports/graph-repository/index.ts";
import { ENTITY_QUERY_KEY, type EntityQuery } from "./middlewares/validate-find-entity-request.ts";
import { ENTITY_LIST_QUERY_KEY } from "./middlewares/validate-list-entities-request.ts";
import type { GraphService } from "./service.ts";

// Controller of the graph routes: translates HTTP into a call to the service and the service's result
// (or error) back into HTTP. It holds no business rule.
//
// `findEntity`: what happens when someone asks what the graph holds about one entity. By the time it
// runs, the `validateFindEntityRequest` middleware has already checked that `type` and `value` came
// and left them in `response.locals`. Answers 200 with the findings, 404 when nothing mentions the
// entity, and 400 when the domain finds the type or value blank. Any other error is ours (500).
export function createGraphController(service: GraphService) {
  return {
    findEntity: async (_request: Request, response: Response): Promise<void> => {
      const { type, value } = response.locals[ENTITY_QUERY_KEY] as EntityQuery;

      try {
        const findings = await service.findEntity(type, value);

        if (findings === null) {
          response.status(constants.HTTP_STATUS_NOT_FOUND).json({ error: "entity not found" });
          return;
        }

        response.status(constants.HTTP_STATUS_OK).json(findings);
      } catch (error) {
        if (error instanceof InvalidEntityError) {
          response.status(constants.HTTP_STATUS_BAD_REQUEST).json({ error: error.message });
          return;
        }

        throw error;
      }
    },

    // The entity types with how many entities each has. No input to validate.
    listEntityTypes: async (_request: Request, response: Response): Promise<void> => {
      response.status(constants.HTTP_STATUS_OK).json({ types: await service.listEntityTypes() });
    },

    // One page of the entities of the type in the path. `validateListEntitiesRequest` has already
    // checked `search`, `limit` and `offset` and left the whole query in `response.locals`.
    listEntities: async (_request: Request, response: Response): Promise<void> => {
      const query = response.locals[ENTITY_LIST_QUERY_KEY] as EntityListQuery;

      response.status(constants.HTTP_STATUS_OK).json(await service.listEntities(query));
    },
  };
}
