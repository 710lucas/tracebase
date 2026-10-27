import type { Attribute } from "../../core/domain/attribute/index.ts";
import type { Relation } from "../../core/domain/relation/index.ts";
import type { GraphRepository } from "../../core/ports/graph-repository/index.ts";

// A `GraphRepository` that keeps everything in lists inside the running process, so it is lost when
// the process stops. It lets the whole import path work before a real database exists, and in tests
// afterwards. The Memgraph adapter replaces it; nothing that uses the port notices.
//
// `relations` and `attributes` show what was saved. The port itself has no way to read yet.
//
// Importing the same run twice stores everything twice: avoiding that is the job of the idempotent
// write key, which belongs to the Memgraph adapter step.
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
  };
}
