import type { RunSummary } from "../../core/ports/graph-repository/index.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";

// The runs the graph knows, with how many relations and attribute values each one brought. A run is not a
// node: it is a (`tool`, `run`) pair found in the provenance stored on edges, in the current attribute
// records of the entities and in the `:Attribute` history nodes, so three queries count them and the
// totals are added here.
//
// A finding that an earlier run had already stored (same relation, same attribute value) was not stored
// again, so a re-import counts only what it added; it does not change the earlier run's numbers.
export async function listRuns(connection: MemgraphConnection): Promise<RunSummary[]> {
  const [edges, current, history] = await Promise.all([
    connection.run(
      `MATCH (:Entity)-[edge]->(:Entity)
       RETURN edge.tool AS tool, edge.run AS run, count(*) AS total, min(edge.recordedAt) AS receivedAt`,
    ),
    // Each current record is one entry inside a name's map of the entity's `attributes` map: unwind the
    // names, then the qualifiers, then read the record behind each pair.
    connection.run(
      `MATCH (n:Entity) WHERE n.attributes IS NOT NULL
       UNWIND keys(n.attributes) AS name
       UNWIND keys(n.attributes[name]) AS qualifier
       WITH n.attributes[name][qualifier] AS record
       RETURN record.tool AS tool, record.run AS run, count(*) AS total, min(record.recordedAt) AS receivedAt`,
    ),
    connection.run(
      `MATCH (:Entity)-[:HAS_ATTRIBUTE]->(history:Attribute)
       RETURN history.tool AS tool, history.run AS run, count(*) AS total, min(history.recordedAt) AS receivedAt`,
    ),
  ]);

  const byRun = new Map<string, MutableRun>();
  for (const row of edges) add(byRun, row, "relations");
  for (const row of [...current, ...history]) add(byRun, row, "attributes");

  return [...byRun.values()].sort(
    (first, second) =>
      (second.receivedAt ?? 0) - (first.receivedAt ?? 0) ||
      first.tool.localeCompare(second.tool) ||
      first.run.localeCompare(second.run),
  );
}

interface MutableRun {
  tool: string;
  run: string;
  relations: number;
  attributes: number;
  receivedAt?: number;
}

// Adds one row of counts to the run it belongs to, creating the run the first time it appears.
function add(
  byRun: Map<string, MutableRun>,
  row: Record<string, unknown>,
  kind: "relations" | "attributes",
): void {
  const tool = row["tool"] as string;
  const run = row["run"] as string;
  const key = JSON.stringify([tool, run]);

  const summary = byRun.get(key) ?? { tool, run, relations: 0, attributes: 0 };
  summary[kind] += row["total"] as number;

  const receivedAt = row["receivedAt"] as number | null;
  if (receivedAt !== null) {
    summary.receivedAt =
      summary.receivedAt === undefined ? receivedAt : Math.min(summary.receivedAt, receivedAt);
  }

  byRun.set(key, summary);
}
