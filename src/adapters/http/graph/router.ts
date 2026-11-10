import { Router, text } from "express";
import type { GraphRepository } from "../../../core/ports/graph-repository/index.ts";
import { createGraphController } from "./controller.ts";
import { validateFindEntityRequest } from "./middlewares/validate-find-entity-request.ts";
import { validateNeighbourhoodRequest } from "./middlewares/validate-neighbourhood-request.ts";
import { validateShortestPathRequest } from "./middlewares/validate-shortest-path-request.ts";
import { validateSearchRequest } from "./middlewares/validate-search-request.ts";
import { validateEntityQueryRequest } from "./middlewares/validate-entity-query-request.ts";
import { validateMostConnectedRequest } from "./middlewares/validate-most-connected-request.ts";
import { validateQueryOptionsRequest } from "./middlewares/validate-query-options-request.ts";
import { validateListEntitiesRequest } from "./middlewares/validate-list-entities-request.ts";
import { createGraphService } from "./service.ts";

const JSON_CONTENT_TYPE = "application/json";

// The routes under `/graph` (the mount point is chosen in `create-app.ts`): which routes exist, how
// each request is validated, and which controller answers it. It only wires; what a controller does
// lives in `controller.ts`. It builds the module's service and controller from the repository it is
// given, so the module never creates its own storage.
export function createGraphRouter(graphRepository: GraphRepository): Router {
  const controller = createGraphController(createGraphService(graphRepository));

  const router = Router();

  router.get("/entities", validateFindEntityRequest, controller.findEntity);

  router.get(
    "/entities/degree",
    validateFindEntityRequest,
    validateQueryOptionsRequest,
    controller.getEntityDegree,
  );

  router.get(
    "/entities/neighbourhood",
    validateFindEntityRequest,
    validateNeighbourhoodRequest,
    validateQueryOptionsRequest,
    controller.getEntityNeighbourhood,
  );

  router.get(
    "/entities/shortest-path",
    validateShortestPathRequest,
    validateQueryOptionsRequest,
    controller.getShortestPath,
  );

  router.get(
    "/search",
    validateSearchRequest,
    validateQueryOptionsRequest,
    controller.searchEntities,
  );

  // The body is read as plain text, only when the request says it is JSON. Deciding whether it is acceptable
  // is the job of the validation middleware that follows.
  router.post(
    "/query",
    text({ type: JSON_CONTENT_TYPE }),
    validateEntityQueryRequest,
    controller.queryEntities,
  );

  router.get(
    "/most-connected",
    validateMostConnectedRequest,
    validateQueryOptionsRequest,
    controller.getMostConnectedEntities,
  );

  router.get("/types", controller.listEntityTypes);

  router.get("/types/:type/entities", validateListEntitiesRequest, controller.listEntities);

  return router;
}
