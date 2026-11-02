import type { Attribute } from "../../core/domain/attribute/index.ts";
import type { Entity } from "../../core/domain/entity/index.ts";
import type { Relation } from "../../core/domain/relation/index.ts";
import type { GraphRepository } from "../../core/ports/graph-repository/index.ts";
import {
  collectEntities,
  countEntityTypes,
  pageOfEntities,
  summarizeRuns,
  totalsOf,
} from "./summarize-graph.ts";

// A `GraphRepository` that keeps everything in lists inside the running process, so it is lost when
// the process stops. It lets the whole import path work before a real database exists, and in tests
// afterwards. The Memgraph adapter replaces it; nothing that uses the port notices.
//
// `relations` and `attributes` show everything that was saved, for assertions in tests.
//
// Importing the same run twice stores everything twice: avoiding that is the job of the idempotent
// write key, which belongs to the Memgraph adapter step.
//
// `findEntity` walks both lists. That is slow for a large graph and enough for the first version.
export interface InMemoryGraphRepository extends GraphRepository {
  readonly relations: readonly Relation[];
  readonly attributes: readonly Attribute[];
}

export function createInMemoryGraphRepository(): InMemoryGraphRepository {
  const relations: Relation[] = [];
  const attributes: Attribute[] = [];

  return {
    relations,
    attributes,
    save: async (batch) => {
      // A loop and not `push(...items)`: spreading a very large list into arguments can overflow.
      for (const relation of batch.relations) {
        relations.push(relation);
      }
      for (const attribute of batch.attributes) {
        attributes.push(attribute);
      }
    },

    findEntity: async (entity) => {
      const entityRelations = relations.filter(
        (relation) =>
          isSameEntity(relation.source, entity) || isSameEntity(relation.target, entity),
      );
      const entityAttributes = attributes.filter((attribute) =>
        isSameEntity(attribute.entity, entity),
      );
      if (entityRelations.length === 0 && entityAttributes.length === 0) {
        return null;
      }
      return { entity, relations: entityRelations, attributes: entityAttributes };
    },

    listRuns: async () => summarizeRuns(relations, attributes),

    listEntityTypes: async () => countEntityTypes(collectEntities(relations, attributes)),

    listEntities: async (query) => pageOfEntities(collectEntities(relations, attributes), query),

    graphTotals: async () =>
      totalsOf(collectEntities(relations, attributes), relations, attributes),
  };
}

// Identity of an entity: its type and its value, compared exactly (case matters).
function isSameEntity(first: Entity, second: Entity): boolean {
  return first.type === second.type && first.value === second.value;
}
