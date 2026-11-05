import type { Entity } from "../../core/domain/entity/index.ts";
import { createEntity } from "../../core/domain/entity/index.ts";
import {
  createEntityNeighbourhood,
  DEFAULT_QUERY_TIMEOUT_MS,
  QueryTimeoutError,
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

// The edges that leave each of the given entities towards another `:Entity`. Every edge between two of
// them leaves exactly one of them, so it comes once; the ones that go to an entity left out come too and
// are dropped by `createEntityNeighbourhood`.
const EDGES_FROM_ENTITIES =
  "UNWIND $keys AS key " +
  "MATCH (source:Entity {type: key.type, value: key.value})-[edge]->(target:Entity) " +
  "RETURN properties(edge) AS properties, source.type AS sourceType, source.value AS sourceValue, " +
  "target.type AS targetType, target.value AS targetValue";

// The current attributes of each of the given entities, from the `attributes` map of its node.
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
// Three queries: who is near, the edges of those that are kept, their attributes. The time limit is for
// the whole answer, not for each query: each query gets what is left of it, and running out at any
// point fails with a `QueryTimeoutError` that names the whole limit.
export async function getEntityNeighbourhood(
  connection: MemgraphConnection,
  origin: Entity,
  options: QueryOptions & NeighbourhoodOptions = {},
): Promise<EntityNeighbourhood | null> {
  const { hops, maxEntities } = resolveNeighbourhoodOptions(options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
  const startedAt = Date.now();

  const run = async (query: string, parameters: Record<string, unknown>) => {
    const timeLeft = timeoutMs - (Date.now() - startedAt);
    if (timeLeft < 1) throw new QueryTimeoutError(timeoutMs);

    try {
      return await connection.run(query, parameters, { timeoutMs: timeLeft });
    } catch (error) {
      throw error instanceof QueryTimeoutError ? new QueryTimeoutError(timeoutMs) : error;
    }
  };

  // The origin takes one place, so at most `maxEntities` others are asked for: one more than fits is
  // enough to know the answer is cut.
  const rows = (await run(reachedEntitiesQuery(hops), {
    type: origin.type,
    value: origin.value,
    limit: maxEntities,
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
  // Only the entities that will be returned need their edges and attributes.
  const keys = reached.slice(0, maxEntities).map(({ entity }) => ({
    type: entity.type,
    value: entity.value,
  }));

  const edges = (await run(EDGES_FROM_ENTITIES, { keys })) as unknown as EdgeRow[];
  const attributeRows = (await run(ATTRIBUTES_OF_ENTITIES, { keys })) as unknown as AttributesRow[];

  return createEntityNeighbourhood({
    origin,
    hops,
    maxEntities,
    reached,
    relations: edges.map(edgeToRelation),
    attributes: attributeRows.flatMap((row) =>
      currentAttributesOf(createEntity(row.type, row.value), row.current),
    ),
  });
}
