import type { Attribute } from "../../core/domain/attribute/index.ts";
import { entityKey, type Entity } from "../../core/domain/entity/index.ts";
import type { Relation } from "../../core/domain/relation/index.ts";
import {
  createEntityNeighbourhood,
  type EntityNeighbourhood,
  type ReachedEntity,
  type ResolvedNeighbourhoodOptions,
} from "../../core/ports/graph-repository/index.ts";

// The neighbourhood of an entity over the lists the in-memory repository keeps: a search that spreads
// one relation at a time from the origin (so each entity is found at its shortest distance), ignoring
// the direction of the relations, up to `hops` steps. `null` when no relation and no attribute mentions
// the origin. The in-memory repository keeps no attribute history, so all its attributes are current.
export function findNeighbourhood(
  relations: readonly Relation[],
  attributes: readonly Attribute[],
  origin: Entity,
  { hops, maxEntities }: ResolvedNeighbourhoodOptions,
): EntityNeighbourhood | null {
  const neighbours = neighboursOf(relations);
  const originKey = entityKey(origin);

  const mentioned =
    neighbours.has(originKey) ||
    attributes.some((attribute) => entityKey(attribute.entity) === originKey);
  if (!mentioned) {
    return null;
  }

  const reached = new Map<string, ReachedEntity>([[originKey, { entity: origin, distance: 0 }]]);
  let frontier: Entity[] = [origin];
  for (let distance = 1; distance <= hops && frontier.length > 0; distance += 1) {
    const next: Entity[] = [];
    for (const entity of frontier) {
      for (const neighbour of neighbours.get(entityKey(entity)) ?? []) {
        const key = entityKey(neighbour);
        if (!reached.has(key)) {
          reached.set(key, { entity: neighbour, distance });
          next.push(neighbour);
        }
      }
    }
    frontier = next;
  }

  return createEntityNeighbourhood({
    origin,
    hops,
    maxEntities,
    reached: [...reached.values()],
    relations,
    attributes,
  });
}

function neighboursOf(relations: readonly Relation[]): Map<string, Entity[]> {
  const neighbours = new Map<string, Entity[]>();
  for (const { source, target } of relations) {
    for (const [from, to] of [
      [source, target],
      [target, source],
    ] as const) {
      const key = entityKey(from);
      neighbours.set(key, [...(neighbours.get(key) ?? []), to]);
    }
  }
  return neighbours;
}
