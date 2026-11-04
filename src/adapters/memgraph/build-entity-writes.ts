import type { Entity } from "../../core/domain/entity/index.ts";
import type { CypherStatement } from "./memgraph-connection.ts";
import { toEntityLabel } from "./to-cypher-label.ts";

// Finds each entity of the rows by type and value, or creates it.
const MERGE_ENTITIES = "UNWIND $rows AS row MERGE (n:Entity {type: row.type, value: row.value})";

// The queries that make sure every entity of an import exists. They must run before the queries that
// link or describe those entities.
//
// `MERGE` finds the entity by type and value, or creates it, so an entity seen many times is one node.
// The type label goes next to `:Entity` (`:Entity:IP_ADDRESS`); an entity whose type cannot make a
// label stays with `:Entity` only. A label cannot be a query parameter, so there is one query per
// label, each with a list of rows (`UNWIND`); the label is written into the text only after
// `to-cypher-label.ts` made it safe.
export function buildEntityWrites(entities: readonly Entity[]): CypherStatement[] {
  const rowsByLabel = new Map<string | null, { type: string; value: string }[]>();
  const seen = new Set<string>();

  for (const entity of entities) {
    // A list in JSON, not `type + value`, so two different pairs never give the same text.
    const identity = JSON.stringify([entity.type, entity.value]);
    if (seen.has(identity)) continue;
    seen.add(identity);

    const label = toEntityLabel(entity.type);
    const rows = rowsByLabel.get(label) ?? [];
    rows.push({ type: entity.type, value: entity.value });
    rowsByLabel.set(label, rows);
  }

  return [...rowsByLabel].map(([label, rows]) => ({
    query: MERGE_ENTITIES + (label === null ? "" : ` SET n:${label}`),
    parameters: { rows },
  }));
}
