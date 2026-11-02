import type { Attribute } from "../../core/domain/attribute/index.ts";
import type { Entity } from "../../core/domain/entity/index.ts";
import type { Relation } from "../../core/domain/relation/index.ts";
import type {
  EntityListQuery,
  EntityPage,
  EntityTypeCount,
  GraphTotals,
  RunSummary,
} from "../../core/ports/graph-repository/index.ts";

// The questions about the graph as a whole, answered over the two lists the in-memory repository keeps.
// They are plain functions of those lists so they can be tested without a repository.

// Every entity the lists mention, once each. An entity exists only because something mentions it.
export function collectEntities(
  relations: readonly Relation[],
  attributes: readonly Attribute[],
): Entity[] {
  const byIdentity = new Map<string, Entity>();
  const mentioned = [
    ...relations.flatMap((relation) => [relation.source, relation.target]),
    ...attributes.map((attribute) => attribute.entity),
  ];

  for (const entity of mentioned) {
    // A JSON list is one text per (type, value) pair, so two different pairs never collide.
    byIdentity.set(JSON.stringify([entity.type, entity.value]), entity);
  }

  return [...byIdentity.values()];
}

export function summarizeRuns(
  relations: readonly Relation[],
  attributes: readonly Attribute[],
): RunSummary[] {
  const byRun = new Map<string, MutableRun>();

  for (const { provenance } of relations) {
    const run = countFor(byRun, provenance);
    run.relations += 1;
    keepEarliest(run, provenance.recordedAt);
  }
  for (const { provenance } of attributes) {
    const run = countFor(byRun, provenance);
    run.attributes += 1;
    keepEarliest(run, provenance.recordedAt);
  }

  // Most recently received first; runs with no date go last.
  return [...byRun.values()].sort(
    (first, second) =>
      (second.receivedAt ?? 0) - (first.receivedAt ?? 0) ||
      first.tool.localeCompare(second.tool) ||
      first.run.localeCompare(second.run),
  );
}

export function countEntityTypes(entities: readonly Entity[]): EntityTypeCount[] {
  const counts = new Map<string, number>();

  for (const { type } of entities) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return [...counts]
    .map(([type, count]) => ({ type, count }))
    .sort((first, second) => second.count - first.count || first.type.localeCompare(second.type));
}

export function pageOfEntities(entities: readonly Entity[], query: EntityListQuery): EntityPage {
  const search = query.search?.toLowerCase();
  const matching = entities
    .filter((entity) => entity.type === query.type)
    .filter((entity) => search === undefined || entity.value.toLowerCase().includes(search))
    .sort((first, second) => first.value.localeCompare(second.value));

  return {
    total: matching.length,
    entities: matching.slice(query.offset, query.offset + query.limit),
  };
}

export function totalsOf(
  entities: readonly Entity[],
  relations: readonly Relation[],
  attributes: readonly Attribute[],
): GraphTotals {
  return { entities: entities.length, relations: relations.length, attributes: attributes.length };
}

interface MutableRun {
  tool: string;
  run: string;
  relations: number;
  attributes: number;
  receivedAt?: number;
}

function countFor(
  byRun: Map<string, MutableRun>,
  provenance: { tool: string; run: string },
): MutableRun {
  const key = JSON.stringify([provenance.tool, provenance.run]);
  const existing = byRun.get(key);
  if (existing !== undefined) return existing;

  const created: MutableRun = {
    tool: provenance.tool,
    run: provenance.run,
    relations: 0,
    attributes: 0,
  };
  byRun.set(key, created);
  return created;
}

function keepEarliest(run: MutableRun, recordedAt: number | undefined): void {
  if (recordedAt === undefined) return;
  run.receivedAt = run.receivedAt === undefined ? recordedAt : Math.min(run.receivedAt, recordedAt);
}
