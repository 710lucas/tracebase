import express, { type Express } from "express";
import type { GraphRepository } from "../../core/ports/graph-repository/index.ts";
import { createImportsRouter } from "./imports/router.ts";
import { notFoundHandler } from "./not-found-handler.ts";

// Where each group of routes is mounted. Routers define their routes relative to this.
const IMPORTS_MOUNT_PATH = "/imports";

// What the application needs from the outside. Today only where to store the graph.
export interface AppDependencies {
  graphRepository: GraphRepository;
}

// Assembles the Express application: mounts the routers and the fallback, in the order they must
// run. It defines no endpoint, reads no body and does not listen: the caller decides the port, which
// keeps this function testable (tests listen on a free port) and keeps process concerns in `main.ts`.
export function createApp({ graphRepository }: AppDependencies): Express {
  const app = express();
  app.use(IMPORTS_MOUNT_PATH, createImportsRouter(graphRepository));
  app.use(notFoundHandler);
  return app;
}
