import type { Attribute } from "../../core/domain/attribute/index.ts";
import { attributeLookupKey, type AttributeRecord } from "./attribute-record.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";

// The current records the database already has for the entities that some attributes belong to, found
// by `attributeLookupKey` (entity and name). An entity that is not in the graph yet simply has none.
export async function readCurrentAttributes(
  connection: MemgraphConnection,
  attributes: readonly Attribute[],
): Promise<Map<string, AttributeRecord>> {
  const records = new Map<string, AttributeRecord>();
  if (attributes.length === 0) return records;

  const entities = new Map(
    attributes.map(({ entity }) => [JSON.stringify([entity.type, entity.value]), entity]),
  );

  const rows = await connection.run(
    `UNWIND $entities AS e
     MATCH (n:Entity {type: e.type, value: e.value})
     WHERE n.attributes IS NOT NULL
     RETURN n.type AS type, n.value AS value, n.attributes AS attributes`,
    { entities: [...entities.values()].map(({ type, value }) => ({ type, value })) },
  );

  for (const row of rows) {
    const stored = row["attributes"] as Record<string, AttributeRecord>;
    const entity = entities.get(JSON.stringify([row["type"], row["value"]]));
    if (entity === undefined) continue;

    for (const [name, record] of Object.entries(stored)) {
      records.set(attributeLookupKey(entity, name), record);
    }
  }

  return records;
}
