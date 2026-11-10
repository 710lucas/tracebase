import type { Entity } from "../../domain/entity/index.ts";
import { compareText } from "../../domain/text/index.ts";

// One entity with how many relations it has: the ones that leave it (`outgoing`), the ones that arrive at it
// (`incoming`) and their sum (`total`). It counts the way `EntityDegree` does (every relation is a finding of
// its own, one from the entity to itself counts in both directions), without the grouping by neighbour type. An entity with no relation is never one of them.
export interface ConnectedEntity {
  readonly entity: Entity;
  readonly total: number;
  readonly incoming: number;
  readonly outgoing: number;
}

// Orders the entities by how many relations they have, the most connected first, and keeps the first `limit`.
// Entities with the same number come ordered by type and then by value, so the same graph always answers in
// the same order. It is the one place that knows this order for a repository that counts everything itself
// (the memory one); Memgraph asks its database for the same order.
export function rankMostConnected(
  candidates: readonly ConnectedEntity[],
  limit: number,
): ConnectedEntity[] {
  return [...candidates]
    .sort(
      (first, second) =>
        second.total - first.total ||
        compareText(first.entity.type, second.entity.type) ||
        compareText(first.entity.value, second.entity.value),
    )
    .slice(0, limit);
}
