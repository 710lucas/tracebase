import express, { type Express } from "express";
import { createImportsRouter } from "./imports/router.ts";
import { notFoundHandler } from "./not-found-handler.ts";

// Where each group of routes is mounted. Routers define their routes relative to this.
const IMPORTS_MOUNT_PATH = "/imports";

// Assembles the Express application: mounts the routers and the fallback, in the order they must
// run. It defines no endpoint, reads no body and does not listen: the caller decides the port, which
// keeps this function testable (tests listen on a free port) and keeps process concerns in `main.ts`.
export function createApp(): Express {
  const app = express();
  app.use(IMPORTS_MOUNT_PATH, createImportsRouter());
  app.use(notFoundHandler);
  return app;
}
