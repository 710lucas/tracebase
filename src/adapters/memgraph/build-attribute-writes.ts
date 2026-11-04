import type { AttributeWrite, AttributeWrites } from "./decide-attribute-writes.ts";
import { toQualifierKey } from "./attribute-record.ts";
import type { CypherStatement } from "./memgraph-connection.ts";
import { withoutUndefined } from "./without-undefined.ts";

// Puts the current record of each row in the `attributes` map of its entity node, which holds one map per
// name and, inside it, one record per qualifier. Memgraph has neither `map + map` nor `n.map[key] = value`,
// so the map is updated with the MAGE function `map.set_key`, which returns the map with one key set; here
// it is applied twice, once for the record inside the name's map and once for that map inside `attributes`
// (see `docs/memgraph.md`).
const SET_CURRENT_RECORDS =
  "UNWIND $rows AS row " +
  "MATCH (n:Entity {type: row.entityType, value: row.entityValue}) " +
  "WITH n, row, coalesce(n.attributes, {}) AS attributes " +
  "SET n.attributes = map.set_key(attributes, row.name, " +
  "map.set_key(coalesce(attributes[row.name], {}), row.qualifier, row.record))";

// Keeps the replaced value of each row as an `:Attribute` node linked to its entity. `MERGE` finds the node
// by its `key`, or creates it, so keeping the same value twice leaves one node.
const KEEP_REPLACED_RECORDS =
  "UNWIND $rows AS row " +
  "MATCH (n:Entity {type: row.entityType, value: row.entityValue}) " +
  "MERGE (history:Attribute {key: row.record.key}) " +
  "ON CREATE SET history += row.record, history.name = row.name, history.qualifier = row.historyQualifier " +
  "MERGE (n)-[:HAS_ATTRIBUTE]->(history)";

// The queries that store the attributes of an import. The entities must already exist (see
// `build-entity-writes.ts`).
export function buildAttributeWrites(writes: AttributeWrites): CypherStatement[] {
  return [...buildCurrentWrites(writes.current), ...buildHistoryWrites(writes.history)];
}

function buildCurrentWrites(writes: readonly AttributeWrite[]): CypherStatement[] {
  if (writes.length === 0) return [];

  return [{ query: SET_CURRENT_RECORDS, parameters: { rows: writes.map(toRow) } }];
}

function buildHistoryWrites(writes: readonly AttributeWrite[]): CypherStatement[] {
  if (writes.length === 0) return [];

  return [{ query: KEEP_REPLACED_RECORDS, parameters: { rows: writes.map(toRow) } }];
}

function toRow(write: AttributeWrite) {
  return {
    entityType: write.entity.type,
    entityValue: write.entity.value,
    name: write.name,
    // The key of the current record inside the name's map, and the property of a history node. Only the
    // second one is left out when there is no qualifier: setting a property to null removes it.
    qualifier: toQualifierKey(write.qualifier),
    historyQualifier: write.qualifier ?? null,
    record: withoutUndefined({ ...write.record }),
  };
}
