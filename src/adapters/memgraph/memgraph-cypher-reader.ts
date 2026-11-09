import type { CypherReader } from "../../core/ports/cypher-reader/index.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";
import { readCypher } from "./read-cypher.ts";

// The `CypherReader` that answers from Memgraph. It shares the connection with the repository and has no state.
export function createMemgraphCypherReader(connection: MemgraphConnection): CypherReader {
  return { readCypher: (statement, options) => readCypher(connection, statement, options) };
}
