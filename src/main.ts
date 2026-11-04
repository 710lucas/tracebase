import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./adapters/http/index.ts";
import { createGraphRepository } from "./create-graph-repository.ts";

// Composition root: the only place that starts the process and chooses what is plugged into what. It
// decides the port and the repository, and prints where the server is. `PORT`, `MEMGRAPH_URL`,
// `MEMGRAPH_USER` and `MEMGRAPH_PASSWORD` come from the environment so the same code runs anywhere: with
// `MEMGRAPH_URL` set (for example `bolt://localhost:7687`) the graph is kept in Memgraph, without it in
// memory; the user and the password are only for a Memgraph that asks for them.
const DEFAULT_PORT = 3333;
const port = Number(process.env["PORT"] ?? DEFAULT_PORT);
const memgraphUrl = process.env["MEMGRAPH_URL"];

// Where the front end builds to (`npm run web:build`). It is served only if it was built.
const webRoot = fileURLToPath(new URL("../web/dist", import.meta.url));
const webIsBuilt = existsSync(webRoot);

const { repository: graphRepository, close: closeGraphRepository } = await createGraphRepository({
  ...(memgraphUrl !== undefined && { memgraphUrl }),
  ...(process.env["MEMGRAPH_USER"] !== undefined && { memgraphUser: process.env["MEMGRAPH_USER"] }),
  ...(process.env["MEMGRAPH_PASSWORD"] !== undefined && {
    memgraphPassword: process.env["MEMGRAPH_PASSWORD"],
  }),
});

const app = createApp({
  graphRepository,
  runtimeInfo: memgraphUrl ? { storage: "memgraph", memgraphUrl } : { storage: "memory" },
  ...(webIsBuilt && { webRoot }),
});

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  console.log(
    memgraphUrl
      ? `storing the graph in Memgraph at ${memgraphUrl}`
      : "storing the graph in memory (set MEMGRAPH_URL to use Memgraph)",
  );
  console.log(
    webIsBuilt
      ? `front end at http://localhost:${port}/`
      : "front end not built (run `npm run web:build` to serve it)",
  );
});

// Ctrl+C or `docker stop`: stop taking requests, let the ones in progress finish (an import is one
// transaction, so it either finishes or leaves nothing), close the connection to Memgraph and leave. The
// handler runs once: a second signal finds no handler and ends the process at once, for when waiting is
// not wanted.
function shutDown(signal: string): void {
  console.log(`${signal} received, shutting down`);

  server.close((serverError) => {
    closeGraphRepository()
      .catch((error: unknown) => {
        console.error(`could not close the graph repository: ${(error as Error).message}`);
        process.exitCode = 1;
      })
      .finally(() => process.exit(serverError === undefined ? process.exitCode : 1));
  });
  // A browser keeps its connection open between requests, which would hold `close` back for good.
  server.closeIdleConnections();
}

process.once("SIGINT", () => shutDown("SIGINT"));
process.once("SIGTERM", () => shutDown("SIGTERM"));
