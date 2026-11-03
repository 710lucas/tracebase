import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./adapters/http/index.ts";
import { createGraphRepository } from "./create-graph-repository.ts";

// Composition root: the only place that starts the process and chooses what is plugged into what. It
// decides the port and the repository, and prints where the server is. `PORT` and `MEMGRAPH_URL` come
// from the environment so the same code runs anywhere: with `MEMGRAPH_URL` set (for example
// `bolt://localhost:7687`) the graph is kept in Memgraph, without it in memory.
const DEFAULT_PORT = 3333;
const port = Number(process.env["PORT"] ?? DEFAULT_PORT);
const memgraphUrl = process.env["MEMGRAPH_URL"];

// Where the front end builds to (`npm run web:build`). It is served only if it was built.
const webRoot = fileURLToPath(new URL("../web/dist", import.meta.url));
const webIsBuilt = existsSync(webRoot);

const graphRepository = await createGraphRepository(memgraphUrl);

const app = createApp({
  graphRepository,
  runtimeInfo: memgraphUrl ? { storage: "memgraph", memgraphUrl } : { storage: "memory" },
  ...(webIsBuilt && { webRoot }),
});

app.listen(port, () => {
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
