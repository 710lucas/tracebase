import { Router } from "express";
import type { GraphRepository } from "../../../core/ports/graph-repository/index.ts";
import { createStatusController } from "./controller.ts";
import type { RuntimeInfo } from "./runtime-info.ts";
import { createStatusService } from "./service.ts";

// The route under `/status` (the mount point is chosen in `create-app.ts`). It only wires: it builds the
// module's service and controller from the repository and the runtime information it is given.
export function createStatusRouter(
  graphRepository: GraphRepository,
  runtimeInfo: RuntimeInfo,
): Router {
  const controller = createStatusController(createStatusService(graphRepository, runtimeInfo));

  const router = Router();

  router.get("/", controller.getStatus);

  return router;
}
