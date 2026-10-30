import type { Attribute } from "../../core/domain/attribute/index.ts";
import type { Entity } from "../../core/domain/entity/index.ts";
import type { Relation } from "../../core/domain/relation/index.ts";
import type { EntityFindings } from "../../core/ports/graph-repository/index.ts";
import type { AttributeRecord } from "./attribute-record.ts";
import { edgeToRelation, type EdgeRow } from "./edge-to-relation.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";
import { recordToAttribute } from "./record-to-attribute.ts";

// Everything the graph holds about one entity, or `null` when no relation and no attribute mentions it
// (an entity only exists in the graph because something mentions it).
//
// The relations are the edges that touch the entity's node in either direction; the pattern asks for
// an `:Entity` on the other end, which leaves out the `HAS_ATTRIBUTE` links. The attributes are the
// current records in the node's `attributes` map plus the replaced values kept as `:Attribute` nodes.
// Both lists come ordered by `key` so the same graph always answers in the same order.
export async function findEntity(
  connection: MemgraphConnection,
  entity: Entity,
): Promise<EntityFindings | null> {
  const parameters = { type: entity.type, value: entity.value };

  const edges = await connection.run(
    `MATCH (n:Entity {type: $type, value: $value})-[edge]-(:Entity)
     RETURN properties(edge) AS properties,
            startNode(edge).type AS sourceType, startNode(edge).value AS sourceValue,
            endNode(edge).type AS targetType, endNode(edge).value AS targetValue
     ORDER BY edge.key`,
    parameters,
  );

  // The query has at most one row: an entity is one node (the uniqueness constraint on type and value)
  // and `collect` folds all its history nodes into that row. No row means the node does not exist.
  const [attributesRow] = await connection.run(
    `MATCH (n:Entity {type: $type, value: $value})
     OPTIONAL MATCH (n)-[:HAS_ATTRIBUTE]->(history:Attribute)
     WITH n, history ORDER BY history.key
     RETURN n.attributes AS current, collect(properties(history)) AS history`,
    parameters,
  );

  const relations = toRelations(edges as unknown as EdgeRow[]);
  const attributes = toAttributes(entity, attributesRow);

  if (relations.length === 0 && attributes.length === 0) return null;

  return { entity, relations, attributes };
}

// An edge that starts and ends on the same entity is read twice, once from each side, so the repeats
// are dropped by key.
function toRelations(edges: readonly EdgeRow[]): Relation[] {
  const byKey = new Map(edges.map((edge) => [edge.properties.key, edge] as const));

  return [...byKey.values()].map(edgeToRelation);
}

function toAttributes(entity: Entity, row: Record<string, unknown> | undefined): Attribute[] {
  if (row === undefined) return [];

  const current = (row["current"] ?? {}) as Record<string, AttributeRecord>;
  const history = row["history"] as (AttributeRecord & { name: string })[];

  return [
    ...Object.entries(current).map(([name, record]) => recordToAttribute(entity, name, record)),
    ...history.map((record) => recordToAttribute(entity, record.name, record)),
  ];
}
