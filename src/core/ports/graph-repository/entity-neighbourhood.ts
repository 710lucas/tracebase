import type { Attribute } from "../../domain/attribute/index.ts";
import { entityKey, type Entity } from "../../domain/entity/index.ts";
import type { Relation } from "../../domain/relation/index.ts";

// An entity reached by the neighbourhood: how many relations away from the origin it is (the origin
// itself is at 0; the direction of a relation is ignored) and its current attributes.
export interface NeighbourhoodEntity {
  readonly entity: Entity;
  readonly distance: number;
  readonly attributes: readonly Attribute[];
}

// Everything within `hops` relations of the `origin`, up to `maxEntities` entities.
//
// `entities` is ordered by distance, then by type, then by value, and starts with the origin. When more
// entities were reached than `maxEntities` allows, the nearest ones are the ones kept and `truncated` is
// true: the caller can ask again with a bigger `maxEntities` (and more time), and because the order never
// changes the bigger answer starts with this one. `relations` holds only the relations whose two ends are
// both in `entities`, so the answer is closed in itself; a relation to an entity left out is not shown.
// The order of `relations` is not defined. `attributes` are the current ones, without the history.
export interface EntityNeighbourhood {
  readonly origin: Entity;
  readonly hops: number;
  readonly maxEntities: number;
  readonly entities: readonly NeighbourhoodEntity[];
  readonly relations: readonly Relation[];
  readonly truncated: boolean;
}

// An entity found by the search and how far it is from the origin.
export interface ReachedEntity {
  readonly entity: Entity;
  readonly distance: number;
}

export interface NeighbourhoodParts {
  readonly origin: Entity;
  readonly hops: number;
  readonly maxEntities: number;
  // Every entity reached within `hops`, each once, in any order (a repository that already knows only
  // the first `maxEntities + 1` matter may bring just those).
  readonly reached: readonly ReachedEntity[];
  // Relations and current attributes that touch the reached entities; the ones that belong to entities
  // that end up left out are dropped here.
  readonly relations: readonly Relation[];
  readonly attributes: readonly Attribute[];
}

// Builds the `EntityNeighbourhood` that `GraphRepository.getEntityNeighbourhood` answers, from what a
// repository found. It is the one place that knows the order, the cut and which relations stay, so every
// repository (memory, Memgraph) answers in the same way.
export function createEntityNeighbourhood(parts: NeighbourhoodParts): EntityNeighbourhood {
  const { origin, hops, maxEntities, reached } = parts;

  const kept = [...reached]
    .sort(
      (first, second) =>
        first.distance - second.distance ||
        first.entity.type.localeCompare(second.entity.type) ||
        first.entity.value.localeCompare(second.entity.value),
    )
    .slice(0, maxEntities);
  const keptKeys = new Set(kept.map(({ entity }) => entityKey(entity)));

  const attributesByEntity = new Map<string, Attribute[]>();
  for (const attribute of parts.attributes) {
    const key = entityKey(attribute.entity);
    attributesByEntity.set(key, [...(attributesByEntity.get(key) ?? []), attribute]);
  }

  return {
    origin,
    hops,
    maxEntities,
    entities: kept.map(({ entity, distance }) => ({
      entity,
      distance,
      attributes: attributesByEntity.get(entityKey(entity)) ?? [],
    })),
    relations: parts.relations.filter(
      (relation) =>
        keptKeys.has(entityKey(relation.source)) && keptKeys.has(entityKey(relation.target)),
    ),
    truncated: reached.length > maxEntities,
  };
}
