import {
  DEFAULT_QUERY_TIMEOUT_MS,
  QueryTimeoutError,
  type QueryOptions,
} from "../../core/ports/graph-repository/index.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";

// A way to run the several queries of one answer inside ONE time limit (`QueryOptions.timeoutMs`, or the
// default). Each query is given what is left of the limit when it starts, so the answer as a whole never
// takes longer than the limit; when the limit is used up before a query starts, or Memgraph cancels one
// because it ran out, it fails with a `QueryTimeoutError` that names the WHOLE limit and not what was left.
export function withinTimeLimit(connection: MemgraphConnection, options: QueryOptions) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
  const startedAt = Date.now();

  return async (query: string, parameters: Record<string, unknown>) => {
    const timeLeft = timeoutMs - (Date.now() - startedAt);
    if (timeLeft < 1) throw new QueryTimeoutError(timeoutMs);

    try {
      return await connection.run(query, parameters, { timeoutMs: timeLeft });
    } catch (error) {
      throw error instanceof QueryTimeoutError ? new QueryTimeoutError(timeoutMs) : error;
    }
  };
}
