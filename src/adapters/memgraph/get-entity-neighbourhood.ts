import type { Entity } from "../../core/domain/entity/index.ts";
import { createEntity } from "../../core/domain/entity/index.ts";
import {
  createEntityNeighbourhood,
  resolveNeighbourhoodOptions,
  type EntityNeighbourhood,
  type NeighbourhoodOptions,
  type QueryOptions,
  type ReachedEntity,
} from "../../core/ports/graph-repository/index.ts";
import type { AttributeRecord } from "./attribute-record.ts";
import { currentAttributesOf } from "./current-attributes.ts";
import { edgeToRelation, type EdgeRow } from "./edge-to-relation.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";
import { withinTimeLimit } from "./within-time-limit.ts";

// The entities within `hops` relations of the origin, nearest first, as far as `LIMIT`. `*BFS` spreads
// one edge at a time and reaches each node once, by its shortest path, so the work grows with the size of
// the neighbourhood and not with the number of paths (a plain variable-length pattern walks every path).
// Edges are followed in both directions; the end must be an `:Entity`, which leaves out the
// `HAS_ATTRIBUTE` links. `hops` is written into the text because the bound of a path cannot be a
// parameter; it is safe because `resolveNeighbourhoodOptions` only lets a whole number through.
// The origin always gives one row, with no entity when nothing is near it; no row means it does not exist.
// The order is the one `createEntityNeighbourhood` uses (distance, type, value, character by character).
function reachedEntitiesQuery(hops: number): string {
  return (
    "MATCH (origin:Entity {type: $type, value: $value}) " +
    `OPTIONAL MATCH path = (origin)-[*BFS ..${hops}]-(reached:Entity) ` +
    "WITH reached, size(path) AS distance " +
    "ORDER BY distance, reached.type, reached.value LIMIT toInteger($limit) " +
    "RETURN reached.type AS type, reached.value AS value, distance"
  );
}

// The edges that touch each of the given entities (the ones of one page), in either direction, towards
// another `:Entity`. An edge between two of them is read from both sides and one that starts and ends on
// the same entity twice, so the repeats are dropped by key; the ones that go to an entity of another page
// come too and `createEntityNeighbourhood` keeps or drops them by the rule of the pages.
const EDGES_TOUCHING_ENTITIES =
  "UNWIND $keys AS key " +
  "MATCH (n:Entity {type: key.type, value: key.value})-[edge]-(:Entity) " +
  "RETURN properties(edge) AS properties, " +
  "startNode(edge).type AS sourceType, startNode(edge).value AS sourceValue, " +
  "endNode(edge).type AS targetType, endNode(edge).value AS targetValue";

// The current attributes of each of the given entities (the ones of the page), from the `attributes` map of its node.
const ATTRIBUTES_OF_ENTITIES =
  "UNWIND $keys AS key " +
  "MATCH (n:Entity {type: key.type, value: key.value}) " +
  "RETURN n.type AS type, n.value AS value, n.attributes AS current";

interface ReachedRow {
  type: string | null;
  value: string | null;
  distance: number;
}

interface AttributesRow {
  type: string;
  value: string;
  current: Record<string, Record<string, AttributeRecord>> | null;
}

// The neighbourhood of one entity (see `EntityNeighbourhood`), or `null` when its node does not exist.
// Three queries: who is near (as far as the end of the page, in the order of `createEntityNeighbourhood`),
// the edges of the entities of the page, their attributes. The time limit is for the whole answer, not
// for each query (`withinTimeLimit`).
export async function getEntityNeighbourhood(
  connection: MemgraphConnection,
  origin: Entity,
  options: QueryOptions & NeighbourhoodOptions = {},
): Promise<EntityNeighbourhood | null> {
  const { hops, maxEntities, offset } = resolveNeighbourhoodOptions(options);
  const run = withinTimeLimit(connection, options);

  // The origin takes the first place, so the others asked for are the ones before the end of the page
  // (`offset + maxEntities`) and one more is the origin's place: with that, one entity past the page is
  // known to exist and the answer can say it is cut.
  const rows = (await run(reachedEntitiesQuery(hops), {
    type: origin.type,
    value: origin.value,
    limit: offset + maxEntities,
  })) as unknown as ReachedRow[];

  if (rows.length === 0) return null;

  const reached: ReachedEntity[] = [
    { entity: origin, distance: 0 },
    ...rows.flatMap((row) =>
      row.type === null || row.value === null
        ? []
        : [{ entity: createEntity(row.type, row.value), distance: row.distance }],
    ),
  ];
  // Only the entities of the page need their edges and attributes. `reached` is already in the order of
  // the answer, the origin first and then the rows, which come sorted.
  const keys = reached.slice(offset, offset + maxEntities).map(({ entity }) => ({
    type: entity.type,
    value: entity.value,
  }));

  const edges = (await run(EDGES_TOUCHING_ENTITIES, { keys })) as unknown as EdgeRow[];
  const attributeRows = (await run(ATTRIBUTES_OF_ENTITIES, { keys })) as unknown as AttributesRow[];

  return createEntityNeighbourhood({
    origin,
    hops,
    maxEntities,
    offset,
    reached,
    relations: [...new Map(edges.map((edge) => [edge.properties.key, edge])).values()].map(
      edgeToRelation,
    ),
    attributes: attributeRows.flatMap((row) =>
      currentAttributesOf(createEntity(row.type, row.value), row.current),
    ),
  });
}
