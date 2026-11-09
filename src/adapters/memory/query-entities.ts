import type { Attribute } from "../../core/domain/attribute/index.ts";
import { entityKey, type Entity } from "../../core/domain/entity/index.ts";
import type { Provenance } from "../../core/domain/provenance/index.ts";
import type { Relation } from "../../core/domain/relation/index.ts";
import {
  createEntityQueryCounts,
  createEntityQueryPage,
  indexOfText,
  type EntityQueryAnswer,
  type FoundByQuery,
  type FoundQueryMatch,
  type ProvenanceFilter,
  type ResolvedEntityQuery,
} from "../../core/ports/graph-repository/index.ts";
import { collectEntities } from "./summarize-graph.ts";

// The structured query over the lists the in-memory repository keeps: every entity is checked against all the
// conditions of the query (all must hold). The in-memory repository keeps no attribute history, so
// `includeHistory` changes nothing here and every attribute is current. `createEntityQueryPage` and
// `createEntityQueryCounts` order and cut the answer.
export function queryInMemory(
  relations: readonly Relation[],
  attributes: readonly Attribute[],
  query: ResolvedEntityQuery,
): EntityQueryAnswer {
  const attributesByEntity = groupBy(attributes, ({ entity }) => [entity]);
  const relationsByEntity = groupBy(relations, ({ source, target }) => [source, target]);

  const { provenance: wantedProvenance } = query;

  const found: FoundByQuery[] = [];
  for (const entity of collectEntities(relations, attributes)) {
    const key = entityKey(entity);
    const entityAttributes = attributesByEntity.get(key) ?? [];

    if (!matchesTypesAndValue(entity, query)) continue;
    if (
      wantedProvenance !== undefined &&
      ![...(relationsByEntity.get(key) ?? []), ...entityAttributes].some(({ provenance }) =>
        isSeenBy(provenance, wantedProvenance),
      )
    ) {
      continue;
    }

    const matches = matchAttributeConditions(entityAttributes, query);
    if (matches !== null) {
      found.push({ entity, matches });
    }
  }

  return query.mode === "count"
    ? createEntityQueryCounts(found.map(({ entity }) => entity))
    : createEntityQueryPage({ query, found });
}

function matchesTypesAndValue(entity: Entity, query: ResolvedEntityQuery): boolean {
  if (query.types !== undefined && !query.types.includes(entity.type)) {
    return false;
  }
  return (
    query.value === undefined || indexOfText(entity.value, query.value.text, query.value.match) >= 0
  );
}

// Every given part of the filter must be that of the same observation (one relation or one attribute).
function isSeenBy(provenance: Provenance, filter: ProvenanceFilter): boolean {
  return (
    (filter.tool === undefined || provenance.tool === filter.tool) &&
    (filter.module === undefined || provenance.module === filter.module) &&
    (filter.run === undefined || provenance.run === filter.run)
  );
}

// Where each attribute condition is met by the attributes of the entity, or `null` when one is not met. A
// condition with only a name (and maybe a qualifier) is met by having such an attribute and lists nothing; one
// with a text lists the first value that matches, for each attribute that has one.
function matchAttributeConditions(
  entityAttributes: readonly Attribute[],
  query: ResolvedEntityQuery,
): FoundQueryMatch[] | null {
  const matches: FoundQueryMatch[] = [];

  for (const [condition, wanted] of query.attributes.entries()) {
    const named = entityAttributes.filter(
      (attribute) =>
        attribute.name === wanted.name &&
        (wanted.qualifier === undefined || attribute.qualifier === wanted.qualifier),
    );
    if (named.length === 0) return null;
    if (wanted.text === undefined) continue;

    const { text, match } = wanted;
    const metHere = named.flatMap((attribute) => {
      const value = attribute.values.find((candidate) => indexOfText(candidate, text, match) >= 0);
      return value === undefined
        ? []
        : [
            {
              condition,
              name: attribute.name,
              ...(attribute.qualifier !== undefined && { qualifier: attribute.qualifier }),
              value,
            },
          ];
    });
    if (metHere.length === 0) return null;
    matches.push(...metHere);
  }

  return matches;
}

// The items under the key of each entity they mention (an item can mention more than one).
function groupBy<Item>(
  items: readonly Item[],
  entitiesOf: (item: Item) => readonly Entity[],
): Map<string, Item[]> {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    for (const entity of entitiesOf(item)) {
      const key = entityKey(entity);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
  }
  return groups;
}
