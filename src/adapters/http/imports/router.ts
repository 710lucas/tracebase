import { Router, text } from "express";
import type { GraphRepository } from "../../../core/ports/graph-repository/index.ts";
import { createImportsController } from "./controller.ts";
import { validateCompareRunsRequest } from "./middlewares/validate-compare-runs-request.ts";
import { validateQueryOptionsRequest } from "../graph/middlewares/validate-query-options-request.ts";
import { validateImportRequest } from "./middlewares/validate-import-request.ts";
import { createImportsService } from "./service.ts";

const JSON_CONTENT_TYPE = "application/json";

// The routes under `/imports` (the mount point is chosen in `create-app.ts`): which routes exist, how
// the body is read and validated, and which controller answers each. It only wires; what a
// controller does lives in `controller.ts`. It also builds the module's service and controller from
// the repository it is given, so the module never creates its own storage.
export function createImportsRouter(graphRepository: GraphRepository): Router {
  const controller = createImportsController(createImportsService(graphRepository));
  const router = Router();
  // The body is read as plain text, only when the request says it is JSON. Deciding whether it is
  // acceptable is the job of the validation middleware that follows.
  router.post(
    "/",
    text({ type: JSON_CONTENT_TYPE }),
    validateImportRequest,
    controller.importBatch,
  );

  router.get("/", controller.listRuns);

  router.get(
    "/compare",
    validateCompareRunsRequest,
    validateQueryOptionsRequest,
    controller.compareRuns,
  );

  return router;
}
