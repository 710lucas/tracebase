import type { Request, Response } from "express";
// Status code names come from Node (`node:http2` is only where Node publishes them; this API still
// speaks HTTP/1.1 through Express).
import { constants } from "node:http2";
import { InvalidEntityError } from "../../../core/domain/entity/index.ts";
import {
  InvalidNeighbourhoodOptionsError,
  InvalidShortestPathOptionsError,
  QueryTimeoutError,
  type EntityListQuery,
  type QueryOptions,
} from "../../../core/ports/graph-repository/index.ts";
import { ENTITY_QUERY_KEY, type EntityQuery } from "./middlewares/validate-find-entity-request.ts";
import {
  NEIGHBOURHOOD_REQUEST_KEY,
  type NeighbourhoodRequest,
} from "./middlewares/validate-neighbourhood-request.ts";
import { toLeanNeighbourhood } from "./lean-neighbourhood.ts";
import {
  SHORTEST_PATH_REQUEST_KEY,
  type ShortestPathRequest,
} from "./middlewares/validate-shortest-path-request.ts";
import { QUERY_OPTIONS_KEY } from "./middlewares/validate-query-options-request.ts";
import { ENTITY_LIST_QUERY_KEY } from "./middlewares/validate-list-entities-request.ts";
import type { GraphService } from "./service.ts";

// What the caller is told when more entities exist after the page: where the next page starts, or how to
// get them all in one answer. It names URL parameters, which is why it is written here and not in the core.
function truncatedHint(nextOffset: number | undefined): string {
  return `More entities exist after this page; ask for the next page with offset=${nextOffset}, or ask again with a bigger maxEntities and a bigger timeoutMs to get them in one answer`;
}

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

    // How connected one entity is. `validateFindEntityRequest` and `validateQueryOptionsRequest` have
    // already left the entity and the time limit in `response.locals`. Answers 200 with the degree, 404
    // when nothing mentions the entity, 400 when the domain finds the type or value blank, and 504 when
    // the read ran out of time (the body says the limit used, so the caller can ask for less or give
    // more). Any other error is ours (500).
    getEntityDegree: async (_request: Request, response: Response): Promise<void> => {
      const { type, value } = response.locals[ENTITY_QUERY_KEY] as EntityQuery;
      const options = response.locals[QUERY_OPTIONS_KEY] as QueryOptions;

      try {
        const degree = await service.getEntityDegree(type, value, options);

        if (degree === null) {
          response.status(constants.HTTP_STATUS_NOT_FOUND).json({ error: "entity not found" });
          return;
        }

        response.status(constants.HTTP_STATUS_OK).json(degree);
      } catch (error) {
        if (error instanceof InvalidEntityError) {
          response.status(constants.HTTP_STATUS_BAD_REQUEST).json({ error: error.message });
          return;
        }
        if (error instanceof QueryTimeoutError) {
          response
            .status(constants.HTTP_STATUS_GATEWAY_TIMEOUT)
            .json({ error: error.message, timeoutMs: error.timeoutMs });
          return;
        }

        throw error;
      }
    },

    // The entities within some relations of one entity. The three validation middlewares have already
    // left the entity, the neighbourhood request (options and detail) and the time limit in
    // `response.locals`. Answers 200 with one page of the lean neighbourhood, or of the full one when
    // `detail=full`, plus a `hint` when more entities exist after the page; 404 when nothing mentions the
    // entity; 400 when the domain finds the type or value blank or the core refuses hops, maxEntities or an
    // offset past the end; 504 when the read ran out of time. Any other error is ours (500).
    getEntityNeighbourhood: async (_request: Request, response: Response): Promise<void> => {
      const { type, value } = response.locals[ENTITY_QUERY_KEY] as EntityQuery;
      const { options: neighbourhoodOptions, detail } = response.locals[
        NEIGHBOURHOOD_REQUEST_KEY
      ] as NeighbourhoodRequest;
      const options = {
        ...neighbourhoodOptions,
        ...(response.locals[QUERY_OPTIONS_KEY] as QueryOptions),
      };

      try {
        const neighbourhood = await service.getEntityNeighbourhood(type, value, options);

        if (neighbourhood === null) {
          response.status(constants.HTTP_STATUS_NOT_FOUND).json({ error: "entity not found" });
          return;
        }

        const answer = detail === "full" ? neighbourhood : toLeanNeighbourhood(neighbourhood);

        response
          .status(constants.HTTP_STATUS_OK)
          .json(
            neighbourhood.truncated
              ? { ...answer, hint: truncatedHint(neighbourhood.nextOffset) }
              : answer,
          );
      } catch (error) {
        if (
          error instanceof InvalidEntityError ||
          error instanceof InvalidNeighbourhoodOptionsError
        ) {
          response.status(constants.HTTP_STATUS_BAD_REQUEST).json({ error: error.message });
          return;
        }
        if (error instanceof QueryTimeoutError) {
          response
            .status(constants.HTTP_STATUS_GATEWAY_TIMEOUT)
            .json({ error: error.message, timeoutMs: error.timeoutMs });
          return;
        }

        throw error;
      }
    },

    // The path with the fewest relations between two entities. The validation middlewares have already left
    // the two entities, the maximum of hops and the time limit in `response.locals`. Answers 200 with the
    // path (empty when there is none within the hops: that is an answer), 404 when either entity is not in
    // the graph, 400 when the domain finds a type or value blank or the core refuses `maxHops`, and 504 when
    // the read ran out of time. Any other error is ours (500).
    getShortestPath: async (_request: Request, response: Response): Promise<void> => {
      const {
        from,
        to,
        options: pathOptions,
      } = response.locals[SHORTEST_PATH_REQUEST_KEY] as ShortestPathRequest;
      const options = { ...pathOptions, ...(response.locals[QUERY_OPTIONS_KEY] as QueryOptions) };

      try {
        const path = await service.getShortestPath(from, to, options);

        if (path === null) {
          response
            .status(constants.HTTP_STATUS_NOT_FOUND)
            .json({ error: "the entity at the start or at the end of the path was not found" });
          return;
        }

        response.status(constants.HTTP_STATUS_OK).json(path);
      } catch (error) {
        if (
          error instanceof InvalidEntityError ||
          error instanceof InvalidShortestPathOptionsError
        ) {
          response.status(constants.HTTP_STATUS_BAD_REQUEST).json({ error: error.message });
          return;
        }
        if (error instanceof QueryTimeoutError) {
          response
            .status(constants.HTTP_STATUS_GATEWAY_TIMEOUT)
            .json({ error: error.message, timeoutMs: error.timeoutMs });
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
