import type { Attribute } from "../../core/domain/attribute/index.ts";
import type { Entity } from "../../core/domain/entity/index.ts";
import type { Relation } from "../../core/domain/relation/index.ts";
import {
  createEntityDegree,
  resolveEntityQuery,
  resolveNeighbourhoodOptions,
  resolveSearch,
  resolveShortestPathOptions,
  type GraphRepository,
} from "../../core/ports/graph-repository/index.ts";
import { findNeighbourhood } from "./find-neighbourhood.ts";
import { findShortestPath } from "./find-shortest-path.ts";
import { queryInMemory } from "./query-entities.ts";
import { searchInMemory } from "./search-entities.ts";
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

  const repository: InMemoryGraphRepository = {
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

    // The relations of the entity are the ones `findEntity` gathers; each counts once for the type of
    // the entity at its other end, in the direction it points. A relation from the entity to itself is
    // both outgoing and incoming. It takes no `QueryOptions`: counting over two lists in memory ends in
    // milliseconds, so there is nothing to cancel.
    getEntityDegree: async (entity) => {
      const findings = await repository.findEntity(entity);
      if (findings === null) {
        return null;
      }

      const outgoing = findings.relations
        .filter((relation) => isSameEntity(relation.source, entity))
        .map((relation) => ({ type: relation.target.type, count: 1 }));
      const incoming = findings.relations
        .filter((relation) => isSameEntity(relation.target, entity))
        .map((relation) => ({ type: relation.source.type, count: 1 }));

      return createEntityDegree(entity, outgoing, incoming);
    },

    // Like the degree, it takes the time limit of `QueryOptions` and ignores it: the search over two
    // lists in memory ends in milliseconds. `hops` and `maxEntities` are checked and defaulted by the
    // port's own rule.
    getEntityNeighbourhood: async (entity, options) =>
      findNeighbourhood(relations, attributes, entity, resolveNeighbourhoodOptions(options)),

    // Like the others, it takes the time limit of `QueryOptions` and ignores it. Both entities must be in
    // the graph (`findEntity` says so); the options are checked first, so a wrong `maxHops` is always an
    // error, whether the entities exist or not.
    getShortestPath: async (from, to, options) => {
      const resolved = resolveShortestPathOptions(options);
      if (
        (await repository.findEntity(from)) === null ||
        (await repository.findEntity(to)) === null
      ) {
        return null;
      }

      return findShortestPath(relations, from, to, resolved);
    },

    // Like the others, it takes the time limit of `QueryOptions` and ignores it: reading two lists in
    // memory ends in milliseconds. The text and the options are checked by the port's own rule.
    searchEntities: async (text, options) =>
      searchInMemory(relations, attributes, resolveSearch(text, options)),

    // Like the others, it takes the time limit of `QueryOptions` and ignores it. The query is checked and
    // defaulted by the port's own rule.
    queryEntities: async (query) => queryInMemory(relations, attributes, resolveEntityQuery(query)),
  };

  return repository;
}

// Identity of an entity: its type and its value, compared exactly (case matters).
function isSameEntity(first: Entity, second: Entity): boolean {
  return first.type === second.type && first.value === second.value;
}
