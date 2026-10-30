import type { Attribute } from "../../core/domain/attribute/index.ts";
import {
  attributeLookupKey,
  type AttributeRecord,
  type StoredAttributes,
} from "./attribute-record.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";

// What the database already holds about the attributes of the entities that some attributes belong to:
// their current records, and the keys of their replaced values (the `:Attribute` nodes). An entity that
// is not in the graph yet simply has none.
export async function readStoredAttributes(
  connection: MemgraphConnection,
  attributes: readonly Attribute[],
): Promise<StoredAttributes> {
  const records = new Map<string, AttributeRecord>();
  const historyKeys = new Set<string>();
  if (attributes.length === 0) return { records, historyKeys };

  const entities = new Map(
    attributes.map(({ entity }) => [JSON.stringify([entity.type, entity.value]), entity]),
  );

  const rows = await connection.run(
    `UNWIND $entities AS e
     MATCH (n:Entity {type: e.type, value: e.value})
     OPTIONAL MATCH (n)-[:HAS_ATTRIBUTE]->(history:Attribute)
     RETURN n.type AS type, n.value AS value, n.attributes AS attributes,
            collect(history.key) AS historyKeys`,
    { entities: [...entities.values()].map(({ type, value }) => ({ type, value })) },
  );

  for (const row of rows) {
    const entity = entities.get(JSON.stringify([row["type"], row["value"]]));
    if (entity === undefined) continue;

    const stored = (row["attributes"] ?? {}) as Record<string, AttributeRecord>;
    for (const [name, record] of Object.entries(stored)) {
      records.set(attributeLookupKey(entity, name), record);
    }

    for (const key of row["historyKeys"] as string[]) {
      historyKeys.add(key);
    }
  }

  return { records, historyKeys };
}
