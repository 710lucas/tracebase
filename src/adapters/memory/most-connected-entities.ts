import type { Entity } from "../../core/domain/entity/index.ts";
import type { Relation } from "../../core/domain/relation/index.ts";
import {
  rankMostConnected,
  type ConnectedEntity,
  type ResolvedMostConnectedOptions,
} from "../../core/ports/graph-repository/index.ts";

// The entities with the most relations, over the list the in-memory repository keeps. Each relation adds one
// to its source as outgoing and one to its target as incoming, so one from an entity to itself counts in both.
// An entity with no relation (one that only has attributes) is not listed.
export function mostConnectedInMemory(
  relations: readonly Relation[],
  { limit }: ResolvedMostConnectedOptions,
): ConnectedEntity[] {
  const byEntity = new Map<string, { entity: Entity; incoming: number; outgoing: number }>();

  function countsOf(entity: Entity) {
    // A JSON list is one text per (type, value) pair, so two different pairs never collide.
    const key = JSON.stringify([entity.type, entity.value]);
    const counts = byEntity.get(key) ?? { entity, incoming: 0, outgoing: 0 };
    byEntity.set(key, counts);
    return counts;
  }

  for (const { source, target } of relations) {
    countsOf(source).outgoing += 1;
    countsOf(target).incoming += 1;
  }

  const candidates = [...byEntity.values()].map(({ entity, incoming, outgoing }) => ({
    entity,
    total: incoming + outgoing,
    incoming,
    outgoing,
  }));

  return rankMostConnected(candidates, limit);
}
