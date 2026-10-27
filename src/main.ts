import { createApp } from "./adapters/http/index.ts";
import { createInMemoryGraphRepository } from "./adapters/memory/in-memory-graph-repository.ts";

// Composition root: the only place that starts the process and chooses what is plugged into what. It
// decides the port and the repository, and prints where the server is. `PORT` comes from the
// environment so the same code runs anywhere.
//
// EXPAND: the Memgraph repository replaces the in-memory one on the next line.
const DEFAULT_PORT = 3000;
const port = Number(process.env["PORT"] ?? DEFAULT_PORT);

createApp({ graphRepository: createInMemoryGraphRepository() }).listen(port, () => {
  console.log(`import API listening on http://localhost:${port}/imports`);
});
