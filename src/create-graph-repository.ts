import { createInMemoryGraphRepository } from "./adapters/memory/in-memory-graph-repository.ts";
import { connectToMemgraph } from "./adapters/memgraph/memgraph-connection.ts";
import { createMemgraphGraphRepository } from "./adapters/memgraph/memgraph-graph-repository.ts";
import type { GraphRepository } from "./core/ports/graph-repository/index.ts";

// What decides where the graph is kept. The three come from the environment (`MEMGRAPH_URL`,
// `MEMGRAPH_USER`, `MEMGRAPH_PASSWORD`); an empty text counts as not given.
export interface GraphRepositoryConfig {
  memgraphUrl?: string;
  memgraphUser?: string;
  memgraphPassword?: string;
}

// Chooses where the graph is kept: in Memgraph when an address is given, in memory when it is not.
//
// When an address IS given and the database does not answer, this fails (the error says where it tried
// to connect) instead of falling back to memory: a fallback would let the API run and look healthy while
// everything it receives is lost on the next restart. A Memgraph without authentication needs no user;
// one with it needs both. A password with no user is refused, because the connection would ignore it
// and a misconfigured credential would go unnoticed.
export async function createGraphRepository(
  config: GraphRepositoryConfig,
): Promise<GraphRepository> {
  const url = givenOrUndefined(config.memgraphUrl);
  if (url === undefined) {
    return createInMemoryGraphRepository();
  }

  const user = givenOrUndefined(config.memgraphUser);
  const password = givenOrUndefined(config.memgraphPassword);
  if (password !== undefined && user === undefined) {
    throw new Error("MEMGRAPH_PASSWORD is set but MEMGRAPH_USER is not");
  }

  const connection = await connectToMemgraph({
    url,
    ...(user !== undefined && { user }),
    ...(password !== undefined && { password }),
  });

  return createMemgraphGraphRepository(connection);
}

function givenOrUndefined(text: string | undefined): string | undefined {
  return text === undefined || text === "" ? undefined : text;
}
