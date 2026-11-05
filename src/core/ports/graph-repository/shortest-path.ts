import { compareEntities, entityKey, type Entity } from "../../domain/entity/index.ts";
import type { Relation } from "../../domain/relation/index.ts";

// One step of a path: the two entities it joins, and ALL the relations between them, in either direction.
// A step holds every observation of the link (the same link seen by two runs is two relations) and a
// relation that goes the other way, each with its own direction and provenance, so nothing is hidden by
// choosing one.
export interface PathStep {
  readonly from: Entity;
  readonly to: Entity;
  readonly relations: readonly Relation[];
}

// The shortest path between two entities, going along the relations in any direction, with at most
// `maxHops` relations. `entities` goes from `from` to `to`, both included, and `steps` has one step for each
// pair of neighbours in it. When the two are the same entity the path is that one entity and has no step.
// When there is no path within `maxHops`, `entities` and `steps` are empty: that is an answer, not an error.
//
// When several paths have the minimum length the answer is always the same one: the first in the order of
// `compareEntities`, entity by entity from `from` (see `chooseFixedPath`).
export interface ShortestPath {
  readonly from: Entity;
  readonly to: Entity;
  readonly maxHops: number;
  readonly entities: readonly Entity[];
  readonly steps: readonly PathStep[];
}

export interface ShortestPathParts {
  readonly from: Entity;
  readonly to: Entity;
  readonly maxHops: number;
  // The entities of the path in order, `from` first; empty when there is no path.
  readonly entities: readonly Entity[];
  // The relations between the entities of the path, in any order; the ones that are not between two
  // neighbours of the path are ignored.
  readonly relations: readonly Relation[];
}

// Builds the `ShortestPath` that `GraphRepository.getShortestPath` answers, from the path a repository
// chose and the relations between its entities. It is the one place that knows how the steps are made, so
// every repository (memory, Memgraph) answers in the same way.
export function createShortestPath(parts: ShortestPathParts): ShortestPath {
  const { from, to, maxHops, entities } = parts;

  const steps = entities.slice(1).map((next, index) => {
    const previous = entities[index] as Entity;
    return {
      from: previous,
      to: next,
      relations: relationsBetween(parts.relations, previous, next),
    };
  });

  return { from, to, maxHops, entities, steps };
}

function relationsBetween(
  relations: readonly Relation[],
  first: Entity,
  second: Entity,
): Relation[] {
  const firstKey = entityKey(first);
  const secondKey = entityKey(second);

  return relations.filter((relation) => {
    const sourceKey = entityKey(relation.source);
    const targetKey = entityKey(relation.target);
    return (
      (sourceKey === firstKey && targetKey === secondKey) ||
      (sourceKey === secondKey && targetKey === firstKey)
    );
  });
}

export interface FixedPathSearch {
  readonly from: Entity;
  // For every entity within `maxHops` of the target, how many relations away from it it is (the target is 0).
  readonly distanceToTarget: ReadonlyMap<string, number>;
  // The entities linked to the given one by a relation in either direction.
  neighboursOf(entity: Entity): Promise<readonly Entity[]>;
}

// Chooses the one shortest path every repository must answer with. `distanceToTarget` is how far each
// entity is from the target; from `from`, each step goes to the neighbour that is one relation closer to the
// target and is first in the order of `compareEntities`. So among all the shortest paths the answer is the
// one that is first, entity by entity from `from`. Empty when `from` is not within `maxHops` of the target.
// It is a function of its own because the memory repository (which has the whole graph in lists) and
// Memgraph (which is asked for the neighbours of each entity) must choose in exactly the same way.
export async function chooseFixedPath(search: FixedPathSearch): Promise<Entity[]> {
  const { from, distanceToTarget, neighboursOf } = search;

  const hopsToTarget = distanceToTarget.get(entityKey(from));
  if (hopsToTarget === undefined) {
    return [];
  }

  const path = [from];
  let current = from;
  for (let remaining = hopsToTarget; remaining > 0; remaining -= 1) {
    const closer = (await neighboursOf(current)).filter(
      (neighbour) => distanceToTarget.get(entityKey(neighbour)) === remaining - 1,
    );
    const [next] = [...closer].sort(compareEntities);
    path.push(next as Entity);
    current = next as Entity;
  }

  return path;
}
