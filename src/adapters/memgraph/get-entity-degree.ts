import type { Entity } from "../../core/domain/entity/index.ts";
import {
  createEntityDegree,
  DEFAULT_QUERY_TIMEOUT_MS,
  type EntityDegree,
  type NeighbourTypeCount,
  type QueryOptions,
} from "../../core/ports/graph-repository/index.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";

// Counts the edges of one entity by the type of the entity at the other end, first the ones that leave it
// and then the ones that arrive at it. Each direction is its own `OPTIONAL MATCH`, so an edge from the
// entity to itself is counted in both. The other end must be an `:Entity`, which leaves out the
// `HAS_ATTRIBUTE` links. An entity with no edge in a direction yields one group with no type and a count
// of 0 there, which the code below drops.
const COUNT_EDGES_BY_NEIGHBOUR_TYPE =
  "MATCH (n:Entity {type: $type, value: $value}) " +
  "OPTIONAL MATCH (n)-->(target:Entity) " +
  "WITH n, target.type AS neighbourType, count(target) AS edges " +
  "WITH n, collect({type: neighbourType, count: edges}) AS outgoing " +
  "OPTIONAL MATCH (source:Entity)-->(n) " +
  "WITH outgoing, source.type AS neighbourType, count(source) AS edges " +
  "RETURN outgoing, collect({type: neighbourType, count: edges}) AS incoming";

interface DegreeRow {
  outgoing: NeighbourTypeCount[];
  incoming: NeighbourTypeCount[];
}

// How connected one entity is (see `EntityDegree`), or `null` when its node does not exist: a node is
// only created when a relation or an attribute mentions it.
export async function getEntityDegree(
  connection: MemgraphConnection,
  entity: Entity,
  options: QueryOptions = {},
): Promise<EntityDegree | null> {
  // At most one row: an entity is one node (the uniqueness constraint on type and value) and both
  // directions are folded into it by `collect`. No row means the node does not exist.
  const [row] = (await connection.run(
    COUNT_EDGES_BY_NEIGHBOUR_TYPE,
    { type: entity.type, value: entity.value },
    { timeoutMs: options.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS },
  )) as unknown as DegreeRow[];

  if (row === undefined) return null;

  return createEntityDegree(entity, withEdges(row.outgoing), withEdges(row.incoming));
}

function withEdges(counts: NeighbourTypeCount[]): NeighbourTypeCount[] {
  return counts.filter(({ count }) => count > 0);
}
