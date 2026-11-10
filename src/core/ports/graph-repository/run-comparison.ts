import { compareEntitiesByValue, type Entity } from "../../domain/entity/index.ts";
import { compareText } from "../../domain/text/index.ts";
import type { EntityTypeCount } from "./graph-overview.ts";

// Which run: the pair that identifies it in the provenance.
export interface RunRef {
  readonly tool: string;
  readonly run: string;
}

// A group of entities of a comparison: how many there are, how many of each type, and the first `limit` of them
// ordered by value and then by type. `truncated` is true when there are more than the ones listed.
export interface ComparedEntities {
  readonly total: number;
  readonly byType: readonly EntityTypeCount[];
  readonly entities: readonly Entity[];
  readonly truncated: boolean;
}

// Two runs side by side, by the entities each one saw (an entity is seen by a run when a relation or an attribute
// of that run mentions it): the ones only the first saw (`onlyA`, what is not in the second), the ones both saw and
// the ones only the second saw (`onlyB`, what the second brought that the first did not). Relations and attributes are
// not compared: a relation seen by two runs is kept once for each, but an attribute set that a later run saw unchanged
// is not recorded again, so what an attribute run saw is not a complete list.
export interface RunComparison {
  readonly a: RunRef;
  readonly b: RunRef;
  readonly onlyA: ComparedEntities;
  readonly both: ComparedEntities;
  readonly onlyB: ComparedEntities;
}

// Builds the comparison from the entities each run saw. It is the one place that knows how the groups are made and
// ordered, so every way of reading those entities gives the same answer. An entity listed twice in a run counts once.
export function createRunComparison(
  a: RunRef,
  b: RunRef,
  entitiesOfA: readonly Entity[],
  entitiesOfB: readonly Entity[],
  limit: number,
): RunComparison {
  const keyOf = (entity: Entity) => JSON.stringify([entity.type, entity.value]);
  const inA = new Map(entitiesOfA.map((entity) => [keyOf(entity), entity]));
  const inB = new Map(entitiesOfB.map((entity) => [keyOf(entity), entity]));

  const onlyA = [...inA].filter(([key]) => !inB.has(key)).map(([, entity]) => entity);
  const both = [...inA].filter(([key]) => inB.has(key)).map(([, entity]) => entity);
  const onlyB = [...inB].filter(([key]) => !inA.has(key)).map(([, entity]) => entity);

  return {
    a,
    b,
    onlyA: compared(onlyA, limit),
    both: compared(both, limit),
    onlyB: compared(onlyB, limit),
  };
}

function compared(entities: readonly Entity[], limit: number): ComparedEntities {
  const counts = new Map<string, number>();
  for (const { type } of entities) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const ordered = [...entities].sort(compareEntitiesByValue);

  return {
    total: entities.length,
    byType: [...counts]
      .map(([type, count]) => ({ type, count }))
      .sort((first, second) => second.count - first.count || compareText(first.type, second.type)),
    entities: ordered.slice(0, limit),
    truncated: ordered.length > limit,
  };
}
