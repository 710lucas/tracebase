import { createEntity, entityKey, type Entity } from "../../core/domain/entity/index.ts";
import {
  chooseFixedPath,
  createShortestPath,
  resolveShortestPathOptions,
  type QueryOptions,
  type ShortestPath,
  type ShortestPathOptions,
} from "../../core/ports/graph-repository/index.ts";
import { edgeToRelation, type EdgeRow } from "./edge-to-relation.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";
import { withinTimeLimit } from "./within-time-limit.ts";

// Whether the two entities have a node. A node only exists because a relation or an attribute mentions it,
// so no node means the entity is not in the graph. Each `OPTIONAL MATCH` gives one row even when nothing
// matches, and `IS NOT NULL` tells which did.
const WHICH_ENTITIES_EXIST =
  "OPTIONAL MATCH (source:Entity {type: $fromType, value: $fromValue}) " +
  "OPTIONAL MATCH (target:Entity {type: $toType, value: $toValue}) " +
  "RETURN source IS NOT NULL AS sourceExists, target IS NOT NULL AS targetExists";

// How far every entity within `hops` of the target is from it. `*BFS` reaches each node once, by its
// shortest path, in either direction; the end must be an `:Entity`, which leaves out the `HAS_ATTRIBUTE`
// links. `hops` is written into the text because the bound of a path cannot be a parameter; it is safe
// because `resolveShortestPathOptions` only lets a whole number through. The target always gives one row,
// with no entity when nothing is near it.
function distancesToTargetQuery(hops: number): string {
  return (
    "MATCH (target:Entity {type: $type, value: $value}) " +
    `OPTIONAL MATCH path = (target)-[*BFS ..${hops}]-(reached:Entity) ` +
    "RETURN reached.type AS type, reached.value AS value, size(path) AS distance"
  );
}

// The entities linked to one entity by a relation in either direction, each once.
const NEIGHBOURS_OF_ENTITY =
  "MATCH (n:Entity {type: $type, value: $value})-[]-(neighbour:Entity) " +
  "RETURN DISTINCT neighbour.type AS type, neighbour.value AS value";

// The edges between the entities of the path that are neighbours in it, in either direction. For each
// pair, an edge between the two matches once (the two nodes are bound and are different).
const EDGES_BETWEEN_PAIRS =
  "UNWIND $pairs AS pair " +
  "MATCH (a:Entity {type: pair.fromType, value: pair.fromValue})-[edge]-" +
  "(b:Entity {type: pair.toType, value: pair.toValue}) " +
  "RETURN properties(edge) AS properties, " +
  "startNode(edge).type AS sourceType, startNode(edge).value AS sourceValue, " +
  "endNode(edge).type AS targetType, endNode(edge).value AS targetValue";

interface ExistRow {
  sourceExists: boolean;
  targetExists: boolean;
}

interface EntityRow {
  type: string | null;
  value: string | null;
  distance?: number;
}

// The shortest path between two entities (see `ShortestPath`), or `null` when either entity has no node.
// Queries: whether the two exist, how far everything within `maxHops` is from the TARGET, the neighbours of
// each entity on the path being chosen (`chooseFixedPath` asks for one at a time, at most `maxHops` times)
// and the edges between the entities of the path. The time limit is for the whole answer, not for each
// query (`withinTimeLimit`).
export async function getShortestPath(
  connection: MemgraphConnection,
  from: Entity,
  to: Entity,
  options: QueryOptions & ShortestPathOptions = {},
): Promise<ShortestPath | null> {
  const { maxHops } = resolveShortestPathOptions(options);
  const run = withinTimeLimit(connection, options);

  // Always one row: both `OPTIONAL MATCH` give one even when nothing matches.
  const [existRow] = (await run(WHICH_ENTITIES_EXIST, {
    fromType: from.type,
    fromValue: from.value,
    toType: to.type,
    toValue: to.value,
  })) as unknown as ExistRow[];
  if (existRow?.sourceExists !== true || existRow.targetExists !== true) return null;

  const distanceRows = (await run(distancesToTargetQuery(maxHops), {
    type: to.type,
    value: to.value,
  })) as unknown as EntityRow[];
  const distanceToTarget = new Map<string, number>([[entityKey(to), 0]]);
  for (const row of distanceRows) {
    if (row.type !== null && row.value !== null && row.distance !== undefined) {
      distanceToTarget.set(entityKey(createEntity(row.type, row.value)), row.distance);
    }
  }

  const entities = await chooseFixedPath({
    from,
    distanceToTarget,
    neighboursOf: async (entity) => {
      const rows = (await run(NEIGHBOURS_OF_ENTITY, {
        type: entity.type,
        value: entity.value,
      })) as unknown as { type: string; value: string }[];
      return rows.map((row) => createEntity(row.type, row.value));
    },
  });

  const pairs = entities.slice(1).map((next, index) => {
    const previous = entities[index] as Entity;
    return {
      fromType: previous.type,
      fromValue: previous.value,
      toType: next.type,
      toValue: next.value,
    };
  });
  const edges =
    pairs.length === 0 ? [] : ((await run(EDGES_BETWEEN_PAIRS, { pairs })) as unknown as EdgeRow[]);

  return createShortestPath({
    from,
    to,
    maxHops,
    entities,
    relations: [...new Map(edges.map((edge) => [edge.properties.key, edge])).values()].map(
      edgeToRelation,
    ),
  });
}
