import { createInMemoryGraphRepository } from "./adapters/memory/in-memory-graph-repository.ts";
import { connectToMemgraph } from "./adapters/memgraph/memgraph-connection.ts";
import { createMemgraphGraphRepository } from "./adapters/memgraph/memgraph-graph-repository.ts";
import type { GraphRepository } from "./core/ports/graph-repository/index.ts";

// Chooses where the graph is kept: in Memgraph when an address is given, in memory when it is not.
//
// When an address IS given and the database does not answer, this fails (the error says where it tried
// to connect) instead of falling back to memory: a fallback would let the API run and look healthy while
// everything it receives is lost on the next restart.
export async function createGraphRepository(
  memgraphUrl: string | undefined,
): Promise<GraphRepository> {
  if (memgraphUrl === undefined || memgraphUrl === "") {
    return createInMemoryGraphRepository();
  }

  const connection = await connectToMemgraph({ url: memgraphUrl });

  return createMemgraphGraphRepository(connection);
}
