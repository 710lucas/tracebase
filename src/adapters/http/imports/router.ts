import { Router, text } from "express";
import { importBatch } from "./controller.ts";
import { validateImportRequest } from "./middlewares/validate-import-request.ts";

const JSON_CONTENT_TYPE = "application/json";

// The routes under `/imports` (the mount point is chosen in `create-app.ts`): which routes exist, how
// the body is read and validated, and which controller answers each. It only wires; what a
// controller does lives in `controller.ts`.
export function createImportsRouter(): Router {
  const router = Router();
  // The body is read as plain text, only when the request says it is JSON. Deciding whether it is
  // acceptable is the job of the validation middleware that follows.
  router.post("/", text({ type: JSON_CONTENT_TYPE }), validateImportRequest, importBatch);
  return router;
}
