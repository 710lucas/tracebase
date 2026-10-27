import { createEntity } from "../../../core/domain/entity/index.ts";
import type {
  EntityFindings,
  GraphRepository,
} from "../../../core/ports/graph-repository/index.ts";

export interface GraphService {
  findEntity(type: string, value: string): Promise<EntityFindings | null>;
}

// Service of the graph module: answers questions about what the graph holds, using the core. It knows
// nothing about HTTP, and it knows the repository only as the `GraphRepository` port.
//
// `findEntity`: builds the entity with `createEntity`, so the text is normalized exactly as it was when
// the entity was imported, and asks the repository. A blank type or value is rejected by the domain
// with an error the controller turns into a 400. `null` means nothing in the graph mentions it.
export function createGraphService(repository: GraphRepository): GraphService {
  return {
    findEntity: async (type, value) => repository.findEntity(createEntity(type, value)),
  };
}
