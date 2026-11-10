import { createEntity } from "../../core/domain/entity/index.ts";
import {
  DEFAULT_QUERY_TIMEOUT_MS,
  resolveMostConnectedOptions,
  type ConnectedEntity,
  type MostConnectedOptions,
  type QueryOptions,
} from "../../core/ports/graph-repository/index.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";

// The entities with the most relations, ordered in the database by the total (the biggest first), then by
// type and by value, like `rankMostConnected` does in memory. A relation is an edge between two `:Entity`
// nodes, which leaves out the `HAS_ATTRIBUTE` links. Each edge is turned into two sides, one for each end, so
// the database counts everything in ONE pass over the edges (a count per node with a pattern comprehension took
// 3 s on 5,233 entities, this takes tens of milliseconds); an edge from an entity to itself counts in both
// directions. An entity with no relation has no side, so it is not listed.
const MOST_CONNECTED =
  "MATCH (source:Entity)-->(target:Entity) " +
  "UNWIND [{n: source, out: 1, inc: 0}, {n: target, out: 0, inc: 1}] AS side " +
  "WITH side.n AS n, sum(side.out) AS outgoing, sum(side.inc) AS incoming " +
  "RETURN n.type AS type, n.value AS value, outgoing + incoming AS total, outgoing, incoming " +
  "ORDER BY total DESC, type, value " +
  "LIMIT toInteger($limit)";

export async function getMostConnected(
  connection: MemgraphConnection,
  options: QueryOptions & MostConnectedOptions = {},
): Promise<ConnectedEntity[]> {
  const { limit } = resolveMostConnectedOptions(options);

  const rows = await connection.run(
    MOST_CONNECTED,
    { limit },
    { timeoutMs: options.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS },
  );

  return rows.map((row) => ({
    entity: createEntity(row["type"] as string, row["value"] as string),
    total: row["total"] as number,
    incoming: row["incoming"] as number,
    outgoing: row["outgoing"] as number,
  }));
}
