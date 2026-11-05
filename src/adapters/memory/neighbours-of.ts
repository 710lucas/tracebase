import { entityKey, type Entity } from "../../core/domain/entity/index.ts";
import type { Relation } from "../../core/domain/relation/index.ts";

// For each entity (by `entityKey`), the entities linked to it by a relation in either direction. An
// entity with no relation has no entry. The in-memory repository builds it from its list of relations to
// answer the questions that walk the graph (the neighbourhood and the shortest path).
export function neighboursOf(relations: readonly Relation[]): Map<string, Entity[]> {
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
