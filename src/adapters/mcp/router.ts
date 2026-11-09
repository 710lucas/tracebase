import { Router } from "express";
import type { GraphRepository } from "../../core/ports/graph-repository/index.ts";
import { createMcpController } from "./controller.ts";

// The route of the MCP server (the mount point is chosen in `create-app.ts`): every call of the protocol is a
// POST; the other methods are not allowed. It only wires; what the controller does lives in `controller.ts`.
export function createMcpRouter(graphRepository: GraphRepository): Router {
  const controller = createMcpController(graphRepository);

  const router = Router();
  router.post("/", controller.handle);
  router.get("/", controller.methodNotAllowed);
  router.delete("/", controller.methodNotAllowed);

  return router;
}
