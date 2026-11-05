import { entityKey, type Entity } from "../../core/domain/entity/index.ts";
import type { Relation } from "../../core/domain/relation/index.ts";
import {
  chooseFixedPath,
  createShortestPath,
  type ResolvedShortestPathOptions,
  type ShortestPath,
} from "../../core/ports/graph-repository/index.ts";
import { neighboursOf } from "./neighbours-of.ts";

// The shortest path between two entities over the list of relations the in-memory repository keeps. It
// spreads one relation at a time from the TARGET (so every entity within `maxHops` of it learns how far it
// is), ignoring the direction of the relations, and then `chooseFixedPath` walks from the source choosing
// the path every repository must answer. The caller has already checked that both entities exist.
export async function findShortestPath(
  relations: readonly Relation[],
  from: Entity,
  to: Entity,
  { maxHops }: ResolvedShortestPathOptions,
): Promise<ShortestPath> {
  const neighbours = neighboursOf(relations);

  const distanceToTarget = new Map<string, number>([[entityKey(to), 0]]);
  let frontier: Entity[] = [to];
  for (let distance = 1; distance <= maxHops && frontier.length > 0; distance += 1) {
    const next: Entity[] = [];
    for (const entity of frontier) {
      for (const neighbour of neighbours.get(entityKey(entity)) ?? []) {
        const key = entityKey(neighbour);
        if (!distanceToTarget.has(key)) {
          distanceToTarget.set(key, distance);
          next.push(neighbour);
        }
      }
    }
    frontier = next;
  }

  const entities = await chooseFixedPath({
    from,
    distanceToTarget,
    neighboursOf: async (entity) => neighbours.get(entityKey(entity)) ?? [],
  });

  return createShortestPath({ from, to, maxHops, entities, relations });
}
