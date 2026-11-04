import type { Entity } from "../../domain/entity/index.ts";

// How many relations of one entity reach neighbours of one entity type.
export interface NeighbourTypeCount {
  readonly type: string;
  readonly count: number;
}

// How connected one entity is: the relations that leave it (`outgoing`), the ones that arrive at it
// (`incoming`), their sum (`total`), and the same relations grouped by the type of the entity at the
// other end (`byNeighbourType`).
//
// The unit is the relation, not the neighbour: the same link seen by two runs is two relations and
// counts twice, because each one is a finding of its own. A relation from the entity to itself counts
// once as outgoing and once as incoming. So the counts of `byNeighbourType` always add up to `total`.
export interface EntityDegree {
  readonly entity: Entity;
  readonly total: number;
  readonly incoming: number;
  readonly outgoing: number;
  readonly byNeighbourType: readonly NeighbourTypeCount[];
}

// Builds the `EntityDegree` that `GraphRepository.getEntityDegree` answers, from the relations counted by
// the type of the neighbour in each direction. It is the one place that knows how those counts become
// the degree, so every repository (memory, Memgraph) answers in the same way. A type may appear more than
// once in a list (a repository that counts relation by relation gives 1 each time); its counts are
// added. `byNeighbourType` is ordered by count, the biggest first, and by type when counts tie, so the
// same graph always answers in the same order.
export function createEntityDegree(
  entity: Entity,
  outgoingByType: readonly NeighbourTypeCount[],
  incomingByType: readonly NeighbourTypeCount[],
): EntityDegree {
  const outgoing = sumOf(outgoingByType);
  const incoming = sumOf(incomingByType);

  const countByType = new Map<string, number>();
  for (const { type, count } of [...outgoingByType, ...incomingByType]) {
    countByType.set(type, (countByType.get(type) ?? 0) + count);
  }

  const byNeighbourType = [...countByType]
    .map(([type, count]) => ({ type, count }))
    .sort((first, second) => second.count - first.count || first.type.localeCompare(second.type));

  return { entity, total: outgoing + incoming, incoming, outgoing, byNeighbourType };
}

function sumOf(counts: readonly NeighbourTypeCount[]): number {
  return counts.reduce((sum, { count }) => sum + count, 0);
}
