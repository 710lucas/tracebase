import type { Attribute } from "../../domain/attribute/index.ts";
import { entityKey, type Entity } from "../../domain/entity/index.ts";
import type { Relation } from "../../domain/relation/index.ts";
import { InvalidNeighbourhoodOptionsError } from "./invalid-neighbourhood-options-error.ts";

// An entity reached by the neighbourhood: how many relations away from the origin it is (the origin
// itself is at 0; the direction of a relation is ignored) and its current attributes.
export interface NeighbourhoodEntity {
  readonly entity: Entity;
  readonly distance: number;
  readonly attributes: readonly Attribute[];
}

// Everything within `hops` relations of the `origin`, one page of it: the entities in the positions
// `offset` to `offset + maxEntities` of the list ordered by distance, then by type, then by value. The
// origin is the position 0, so it is only in the first page. The order never changes, so asking page after
// page gives every entity once, and a bigger `maxEntities` starts with the same entities.
//
// `truncated` is true when more entities exist after this page, and then `nextOffset` is the `offset` of the
// next page. An `offset` past the end of the list is refused, so an empty page is never an answer.
//
// `relations`: a relation belongs to the page of the entity that comes later in the order. This page holds
// the relations whose two ends are both among the entities delivered up to the end of this page and that
// touch at least one entity of this page, so across the pages every relation comes exactly once and
// whoever has the earlier pages has both ends of each relation. A relation to an entity after this page
// is not shown yet. With `offset` 0 it is the relations between the entities returned. Each observation
// of a run is a relation of its own and the order of `relations` is not defined. `attributes` are the
// current ones, without the history.
export interface EntityNeighbourhood {
  readonly origin: Entity;
  readonly hops: number;
  readonly maxEntities: number;
  readonly offset: number;
  readonly entities: readonly NeighbourhoodEntity[];
  readonly relations: readonly Relation[];
  readonly truncated: boolean;
  readonly nextOffset?: number;
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
  readonly offset: number;
  // Every entity reached within `hops`, each once, in any order (a repository that already knows only
  // the first `offset + maxEntities + 1` matter may bring just those).
  readonly reached: readonly ReachedEntity[];
  // Relations and current attributes that touch the reached entities; the ones that do not belong to
  // this page are dropped here.
  readonly relations: readonly Relation[];
  readonly attributes: readonly Attribute[];
}

// Builds the `EntityNeighbourhood` that `GraphRepository.getEntityNeighbourhood` answers, from what a
// repository found. It is the one place that knows the order, the cut and which relations stay, so every
// repository (memory, Memgraph) answers in the same way.
export function createEntityNeighbourhood(parts: NeighbourhoodParts): EntityNeighbourhood {
  const { origin, hops, maxEntities, offset, reached } = parts;

  const ordered = [...reached].sort(
    (first, second) =>
      first.distance - second.distance ||
      compareText(first.entity.type, second.entity.type) ||
      compareText(first.entity.value, second.entity.value),
  );
  if (ordered.length <= offset) {
    throw new InvalidNeighbourhoodOptionsError(
      `offset ${offset} is past the end: the neighbourhood has ${ordered.length} entities`,
    );
  }

  const pageEnd = offset + maxEntities;
  const rankByKey = new Map(ordered.map(({ entity }, rank) => [entityKey(entity), rank]));
  const page = ordered.slice(offset, pageEnd);

  const attributesByEntity = new Map<string, Attribute[]>();
  for (const attribute of parts.attributes) {
    const key = entityKey(attribute.entity);
    attributesByEntity.set(key, [...(attributesByEntity.get(key) ?? []), attribute]);
  }

  const truncated = ordered.length > pageEnd;

  return {
    origin,
    hops,
    maxEntities,
    offset,
    entities: page.map(({ entity, distance }) => ({
      entity,
      distance,
      attributes: attributesByEntity.get(entityKey(entity)) ?? [],
    })),
    relations: parts.relations.filter((relation) => {
      const sourceRank = rankByKey.get(entityKey(relation.source));
      const targetRank = rankByKey.get(entityKey(relation.target));
      return (
        sourceRank !== undefined &&
        targetRank !== undefined &&
        sourceRank < pageEnd &&
        targetRank < pageEnd &&
        Math.max(sourceRank, targetRank) >= offset
      );
    }),
    truncated,
    ...(truncated && { nextOffset: pageEnd }),
  };
}

// Plain character-by-character order, not the language-aware order of `localeCompare`: a database sorts
// text this way, so a repository that lets its database pick the nearest entities cuts at the same place
// as this function does.
function compareText(first: string, second: string): number {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}
