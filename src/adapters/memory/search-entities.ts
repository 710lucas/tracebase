import type { Attribute } from "../../core/domain/attribute/index.ts";
import { entityKey } from "../../core/domain/entity/index.ts";
import type { Relation } from "../../core/domain/relation/index.ts";
import {
  createEntitySearchPage,
  indexOfText,
  type EntitySearchPage,
  type FoundEntity,
  type FoundMatch,
  type ResolvedSearch,
} from "../../core/ports/graph-repository/index.ts";
import { collectEntities } from "./summarize-graph.ts";

// The search over the lists the in-memory repository keeps: every entity is checked for the text in its
// value and, unless the scope is `entity-value`, in the values of its attributes (one match for each
// attribute that has a value with the text, the first such value being the one shown). The in-memory
// repository keeps no attribute history, so all its attributes are current. `createEntitySearchPage`
// orders the entities, cuts the matches and makes the page.
export function searchInMemory(
  relations: readonly Relation[],
  attributes: readonly Attribute[],
  search: ResolvedSearch,
): EntitySearchPage {
  const attributesByEntity = new Map<string, Attribute[]>();
  if (search.scope === "full") {
    for (const attribute of attributes) {
      const key = entityKey(attribute.entity);
      attributesByEntity.set(key, [...(attributesByEntity.get(key) ?? []), attribute]);
    }
  }

  const found: FoundEntity[] = [];
  for (const entity of collectEntities(relations, attributes)) {
    const matches: FoundMatch[] = [];

    if (indexOfText(entity.value, search.text, search.match) >= 0) {
      matches.push({ where: "entity-value", value: entity.value });
    }
    for (const attribute of attributesByEntity.get(entityKey(entity)) ?? []) {
      const value = attribute.values.find(
        (candidate) => indexOfText(candidate, search.text, search.match) >= 0,
      );
      if (value !== undefined) {
        matches.push({
          where: "attribute",
          name: attribute.name,
          ...(attribute.qualifier !== undefined && { qualifier: attribute.qualifier }),
          value,
        });
      }
    }

    if (matches.length > 0) {
      found.push({ entity, matches });
    }
  }

  return createEntitySearchPage({ search, found });
}
