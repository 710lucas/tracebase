import type { EntityTypeCount } from "../../core/ports/graph-repository/index.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";

// The entity types in the graph with how many entities each has, the biggest first (ties by name so the
// order never changes between calls). It groups on the exact `type` property, not on the label, because
// the label is the normalized form.
export async function listEntityTypes(connection: MemgraphConnection): Promise<EntityTypeCount[]> {
  const rows = await connection.run(
    `MATCH (n:Entity)
     RETURN n.type AS type, count(*) AS count
     ORDER BY count DESC, type`,
  );

  return rows.map((row) => ({ type: row["type"] as string, count: row["count"] as number }));
}
