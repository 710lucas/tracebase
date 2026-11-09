import type { QueryOptions } from "../graph-repository/index.ts";
import type { CypherReadOptions } from "./cypher-read-options.ts";
import type { CypherRows } from "./cypher-rows.ts";

// What the core asks of a store that can answer a Cypher statement the caller wrote (the plan B of the AI
// queries). It is a port of its own, apart from `GraphRepository`, because only a Cypher database can offer it:
// the in-memory repository has no Cypher, and the fixed reads must not depend on one.
//
// The statement is only READ: an implementation must refuse anything that writes or changes the database,
// bound the time (`timeoutMs`, as in `QueryOptions`) and the memory of the statement, and fail with
// `InvalidCypherError` (the statement or an option makes no sense) or `QueryTimeoutError` (the time ran out),
// never with a partial answer.
export interface CypherReader {
  readCypher(statement: string, options?: QueryOptions & CypherReadOptions): Promise<CypherRows>;
}
