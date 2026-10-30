import type { Relation } from "../../core/domain/relation/index.ts";
import type { CypherStatement } from "./memgraph-connection.ts";
import { relationKey } from "./relation-key.ts";
import { toEdgeLabel, toEntityLabel } from "./to-cypher-label.ts";

// The queries that store the entities and relations of one import. They come as a list because the
// order matters: every entity must exist before a relation links it, so the entity queries come first.
//
// A label cannot be a query parameter, so there is one query per label, each with a list of rows
// (`UNWIND`) instead of one query per row. Only labels built by `to-cypher-label.ts` are written into
// the text; every other value travels as a parameter.
export function buildRelationWrites(relations: readonly Relation[]): CypherStatement[] {
  return [...buildEntityWrites(relations), ...buildEdgeWrites(relations)];
}

// `MERGE` finds the entity by type and value, or creates it, so an entity seen many times is one node.
// The type label goes next to `:Entity` (`:Entity:IP_ADDRESS`); an entity whose type cannot make a
// label stays with `:Entity` only.
function buildEntityWrites(relations: readonly Relation[]): CypherStatement[] {
  const rowsByLabel = new Map<string | null, { type: string; value: string }[]>();
  const seen = new Set<string>();

  for (const relation of relations) {
    for (const entity of [relation.source, relation.target]) {
      // A list in JSON, not `type + value`, so two different pairs never give the same text.
      const identity = JSON.stringify([entity.type, entity.value]);
      if (seen.has(identity)) continue;
      seen.add(identity);

      const label = toEntityLabel(entity.type);
      const rows = rowsByLabel.get(label) ?? [];
      rows.push({ type: entity.type, value: entity.value });
      rowsByLabel.set(label, rows);
    }
  }

  return [...rowsByLabel].map(([label, rows]) => ({
    query:
      "UNWIND $rows AS row MERGE (n:Entity {type: row.type, value: row.value})" +
      (label === null ? "" : ` SET n:${label}`),
    parameters: { rows },
  }));
}

// `MERGE` finds the edge by its key, or creates it, so writing the same relation twice leaves one edge.
// The properties are set only when the edge is created: the second write is the same finding, so it
// must not change what the first one recorded.
function buildEdgeWrites(relations: readonly Relation[]): CypherStatement[] {
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
      recordRef: provenance.recordRef,
      confidence: provenance.confidence,
      observedAt: provenance.observedAt,
      recordedAt: provenance.recordedAt,
      // The text the tool sent; the edge label only has its normalized form.
      type: relation.type,
      viaRecordRefs: relation.viaRecordRefs,
    }),
  };
}

// The driver does not accept `undefined` as a value, and a field the tool did not send must not exist
// on the edge.
function withoutUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}
