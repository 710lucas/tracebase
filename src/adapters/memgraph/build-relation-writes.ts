import type { Relation } from "../../core/domain/relation/index.ts";
import type { CypherStatement } from "./memgraph-connection.ts";
import { relationKey } from "./relation-key.ts";
import { toEdgeLabel } from "./to-cypher-label.ts";
import { withoutUndefined } from "./without-undefined.ts";

// The queries that store the relations of one import as edges. Both ends of each relation must already
// exist (see `build-entity-writes.ts`).
//
// `MERGE` finds the edge by its key, or creates it, so writing the same relation twice leaves one edge.
// The properties are set only when the edge is created: the second write is the same finding, so it
// must not change what the first one recorded.
//
// A label cannot be a query parameter, so there is one query per edge label, each with a list of rows
// (`UNWIND`) instead of one query per row. Only labels built by `to-cypher-label.ts` are written into
// the text; every other value travels as a parameter.
export function buildRelationWrites(relations: readonly Relation[]): CypherStatement[] {
  const rowsByLabel = new Map<string, EdgeRow[]>();

  for (const relation of relations) {
    const label = toEdgeLabel(relation.type);
    const rows = rowsByLabel.get(label) ?? [];
    rows.push(toEdgeRow(relation));
    rowsByLabel.set(label, rows);
  }

  return [...rowsByLabel].map(([label, rows]) => ({
    query:
      "UNWIND $rows AS row " +
      "MATCH (source:Entity {type: row.sourceType, value: row.sourceValue}) " +
      "MATCH (target:Entity {type: row.targetType, value: row.targetValue}) " +
      `MERGE (source)-[edge:${label} {key: row.key}]->(target) ` +
      "ON CREATE SET edge += row.properties",
    parameters: { rows },
  }));
}

interface EdgeRow {
  key: string;
  sourceType: string;
  sourceValue: string;
  targetType: string;
  targetValue: string;
  properties: Record<string, unknown>;
}

function toEdgeRow(relation: Relation): EdgeRow {
  const { provenance } = relation;

  return {
    key: relationKey(relation),
    sourceType: relation.source.type,
    sourceValue: relation.source.value,
    targetType: relation.target.type,
    targetValue: relation.target.value,
    properties: withoutUndefined({
      tool: provenance.tool,
      run: provenance.run,
      module: provenance.module,
      recordRefs: provenance.recordRefs === undefined ? undefined : [...provenance.recordRefs],
      confidence: provenance.confidence,
      observedAt: provenance.observedAt,
      recordedAt: provenance.recordedAt,
      // The text the tool sent; the edge label only has its normalized form.
      type: relation.type,
      viaRecordRefs: relation.viaRecordRefs,
    }),
  };
}
