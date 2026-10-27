import type { Attribute } from "../../domain/attribute/index.ts";
import type { Relation } from "../../domain/relation/index.ts";

// What one import brings: the relations and the attributes found by one run of one tool. Both are
// validated models, so a repository never has to check them again.
export interface ImportBatch {
  readonly relations: readonly Relation[];
  readonly attributes: readonly Attribute[];
}

// Where the knowledge graph is kept, as the core sees it: it says WHAT must be stored, never HOW.
// An in-memory list and a Memgraph database both fit behind this; the code that imports data
// cannot tell them apart.
//
// `save` is asynchronous because a real database answers later; an in-memory repository simply
// returns an already finished promise.
//
// EXPAND: reading (find an entity with its relations and attributes) is added when something needs to
// read; the idempotent-write key (so importing the same run twice does not duplicate) belongs to the
// Memgraph adapter step.
export interface GraphRepository {
  save(batch: ImportBatch): Promise<void>;
}
