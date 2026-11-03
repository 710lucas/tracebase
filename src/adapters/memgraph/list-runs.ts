import {
  createRunSummaries,
  type RunItemKind,
  type RunSummaries,
  type RunSummary,
} from "../../core/ports/graph-repository/index.ts";
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

  const runs = createRunSummaries();
  for (const row of edges) addRow(runs, row, "relations");
  for (const row of [...current, ...history]) addRow(runs, row, "attributes");

  return runs.toList();
}

// Adds one row of counts (`tool`, `run`, `total`, `receivedAt`) to the run it belongs to.
function addRow(runs: RunSummaries, row: Record<string, unknown>, kind: RunItemKind): void {
  const receivedAt = row["receivedAt"] as number | null;

  runs.add(
    { tool: row["tool"] as string, run: row["run"] as string },
    kind,
    row["total"] as number,
    receivedAt ?? undefined,
  );
}
