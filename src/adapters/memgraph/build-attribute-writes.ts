import type { AttributeWrite } from "./decide-attribute-writes.ts";
import type { CypherStatement } from "./memgraph-connection.ts";
import { withoutUndefined } from "./without-undefined.ts";

// The query that stores the current records in the `attributes` map of the entity nodes. The entities
// must already exist (see `build-entity-writes.ts`).
//
// Memgraph has neither `map + map` nor `n.map[key] = value`, so the map is updated with the MAGE
// function `map.set_key`, which returns the map with one key set (see `docs/memgraph.md`).
export function buildAttributeWrites(writes: readonly AttributeWrite[]): CypherStatement[] {
  if (writes.length === 0) return [];

  return [
    {
      query:
        "UNWIND $rows AS row " +
        "MATCH (n:Entity {type: row.entityType, value: row.entityValue}) " +
        "SET n.attributes = map.set_key(coalesce(n.attributes, {}), row.name, row.record)",
      parameters: {
        rows: writes.map((write) => ({
          entityType: write.entity.type,
          entityValue: write.entity.value,
          name: write.name,
          record: withoutUndefined({ ...write.record }),
        })),
      },
    },
  ];
}
