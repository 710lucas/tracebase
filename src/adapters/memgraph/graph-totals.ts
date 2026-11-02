import type { GraphTotals } from "../../core/ports/graph-repository/index.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";

// The size of the whole graph. Attributes are counted where they live: the current records are the
// entries of each entity's `attributes` map, the replaced ones are `:Attribute` nodes. The edge pattern
// asks for an `:Entity` on both ends, which leaves out the `HAS_ATTRIBUTE` links.
export async function graphTotals(connection: MemgraphConnection): Promise<GraphTotals> {
  const [entities, relations, current, history] = await Promise.all([
    connection.run("MATCH (n:Entity) RETURN count(n) AS total"),
    connection.run("MATCH (:Entity)-[edge]->(:Entity) RETURN count(edge) AS total"),
    connection.run(
      "MATCH (n:Entity) WHERE n.attributes IS NOT NULL RETURN coalesce(sum(size(keys(n.attributes))), 0) AS total",
    ),
    connection.run("MATCH (history:Attribute) RETURN count(history) AS total"),
  ]);

  return {
    entities: totalOf(entities),
    relations: totalOf(relations),
    attributes: totalOf(current) + totalOf(history),
  };
}

// Each query answers one row with one column named `total`.
function totalOf(rows: Record<string, unknown>[]): number {
  const [row] = rows;
  return (row?.["total"] ?? 0) as number;
}
