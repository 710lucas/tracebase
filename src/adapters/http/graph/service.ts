import { createEntity } from "../../../core/domain/entity/index.ts";
import { normalizeText } from "../../../core/domain/text/index.ts";
import type {
  EntityDegree,
  EntityFindings,
  EntityNeighbourhood,
  EntityListQuery,
  EntityPage,
  EntityTypeCount,
  GraphRepository,
  NeighbourhoodOptions,
  QueryOptions,
} from "../../../core/ports/graph-repository/index.ts";

export interface GraphService {
  findEntity(type: string, value: string): Promise<EntityFindings | null>;
  getEntityDegree(type: string, value: string, options: QueryOptions): Promise<EntityDegree | null>;
  getEntityNeighbourhood(
    type: string,
    value: string,
    options: QueryOptions & NeighbourhoodOptions,
  ): Promise<EntityNeighbourhood | null>;
  listEntityTypes(): Promise<EntityTypeCount[]>;
  listEntities(query: EntityListQuery): Promise<EntityPage>;
}

// Service of the graph module: answers questions about what the graph holds, using the core. It knows
// nothing about HTTP, and it knows the repository only as the `GraphRepository` port.
//
// `findEntity`: builds the entity with `createEntity`, so the text is normalized exactly as it was when
// the entity was imported, and asks the repository. A blank type or value is rejected by the domain
// with an error the controller turns into a 400. `null` means nothing in the graph mentions it.
//
// `getEntityDegree`: same entity building as `findEntity`; asks how connected the entity is, within
// the time limit given (the repository's default when none). `null` means nothing mentions it, and a
// read that runs out of time ends in `QueryTimeoutError`, which the controller turns into a 504.
//
// `getEntityNeighbourhood`: same entity building; asks for the entities within some relations of it, with
// the hops, the maximum of entities and the time limit given (each has a default when missing). `null`
// means nothing mentions it; hops or a maximum that make no sense end in
// `InvalidNeighbourhoodOptionsError`, a read that runs out of time in `QueryTimeoutError`.
//
// `listEntityTypes` and `listEntities`: the entity types with their counts, and a page of the entities
// of one type, for browsing what is there.
export function createGraphService(repository: GraphRepository): GraphService {
  return {
    findEntity: async (type, value) => repository.findEntity(createEntity(type, value)),

    getEntityDegree: async (type, value, options) =>
      repository.getEntityDegree(createEntity(type, value), options),

    getEntityNeighbourhood: async (type, value, options) =>
      repository.getEntityNeighbourhood(createEntity(type, value), options),

    listEntityTypes: () => repository.listEntityTypes(),

    // The type is normalized like an imported one, so stray spaces still match.
    listEntities: async (query) =>
      repository.listEntities({ ...query, type: normalizeText(query.type) }),
  };
}
