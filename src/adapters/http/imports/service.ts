import type { GraphRepository } from "../../../core/ports/graph-repository/index.ts";
import type { ImportPayloadDTO } from "./import-payload-schema.ts";
import { importPayloadToDomain } from "./import-payload-to-domain.ts";

export interface ImportResult {
  relations: number;
  attributes: number;
}

export interface ImportsService {
  importBatch(payload: ImportPayloadDTO): Promise<ImportResult>;
}

// Service of the imports module: carries out the import using the core and answers the controller with
// a plain result. It knows nothing about HTTP, and it knows the repository only as the
// `GraphRepository` port, so what is behind it (memory, Memgraph) can change without touching this.
//
// `importBatch`: builds the domain objects from the payload, saves them and says how many there were.
// Domain errors (a value the domain rejects) are not caught here; they reach the controller, which
// decides how to answer them. Nothing is saved when the payload is rejected.
export function createImportsService(repository: GraphRepository): ImportsService {
  return {
    importBatch: async (payload) => {
      const { relations, attributes } = importPayloadToDomain(payload);
      await repository.save({ relations, attributes });
      console.log(`import saved: ${relations.length} relations, ${attributes.length} attributes`);
      return { relations: relations.length, attributes: attributes.length };
    },
  };
}
