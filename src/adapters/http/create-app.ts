import express, { type Express } from "express";
import type { GraphRepository } from "../../core/ports/graph-repository/index.ts";
import { createGraphRouter } from "./graph/router.ts";
import { createImportsRouter } from "./imports/router.ts";
import { notFoundHandler } from "./not-found-handler.ts";
import type { RuntimeInfo } from "./status/runtime-info.ts";
import { createStatusRouter } from "./status/router.ts";

// Where each group of routes is mounted. Routers define their routes relative to this.
const IMPORTS_MOUNT_PATH = "/imports";
const GRAPH_MOUNT_PATH = "/graph";
const STATUS_MOUNT_PATH = "/status";

// What the application needs from the outside: where the graph is stored, how the process was
// configured (for the status route) and, optionally, the folder with the built front end.
export interface AppDependencies {
  graphRepository: GraphRepository;
  runtimeInfo: RuntimeInfo;
  // The folder `web/` builds into. Without it the application is only an API.
  webRoot?: string;
}

// Assembles the Express application: mounts the routers, the front end and the fallback, in the order
// they must run. It defines no endpoint, reads no body and does not listen: the caller decides the
// port, which keeps this function testable (tests listen on a free port) and keeps process concerns in
// `main.ts`.
//
// The front end's files come after the API routes, so a route always wins over a file of the same path,
// and before the fallback. The front end keeps its own screens in the URL fragment (`#/imports`), so
// the server never has to answer a path other than `/` and the files themselves.
export function createApp({ graphRepository, runtimeInfo, webRoot }: AppDependencies): Express {
  const app = express();
  app.use(IMPORTS_MOUNT_PATH, createImportsRouter(graphRepository));

  app.use(GRAPH_MOUNT_PATH, createGraphRouter(graphRepository));

  app.use(STATUS_MOUNT_PATH, createStatusRouter(graphRepository, runtimeInfo));

  if (webRoot !== undefined) {
    app.use(express.static(webRoot));
  }

  app.use(notFoundHandler);
  return app;
}
