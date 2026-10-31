import { createApp } from "./adapters/http/index.ts";
import { createGraphRepository } from "./create-graph-repository.ts";

// Composition root: the only place that starts the process and chooses what is plugged into what. It
// decides the port and the repository, and prints where the server is. `PORT` and `MEMGRAPH_URL` come
// from the environment so the same code runs anywhere: with `MEMGRAPH_URL` set (for example
// `bolt://localhost:7687`) the graph is kept in Memgraph, without it in memory.
const DEFAULT_PORT = 3000;
const port = Number(process.env["PORT"] ?? DEFAULT_PORT);
const memgraphUrl = process.env["MEMGRAPH_URL"];

const graphRepository = await createGraphRepository(memgraphUrl);

createApp({ graphRepository }).listen(port, () => {
  console.log(`import API listening on http://localhost:${port}/imports`);
  console.log(
    memgraphUrl
      ? `storing the graph in Memgraph at ${memgraphUrl}`
      : "storing the graph in memory (set MEMGRAPH_URL to use Memgraph)",
  );
});
