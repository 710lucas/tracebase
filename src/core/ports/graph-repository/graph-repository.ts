import type { Attribute } from "../../domain/attribute/index.ts";
import type { Entity } from "../../domain/entity/index.ts";
import type { Relation } from "../../domain/relation/index.ts";

// What one import brings: the relations and the attributes found by one run of one tool. Both are
// validated models, so a repository never has to check them again.
export interface ImportBatch {
  readonly relations: readonly Relation[];
  readonly attributes: readonly Attribute[];
}

// Everything the graph holds about one entity: the relations where it is the source or the target,
// and its attributes, each with its own provenance. The same fact seen by two runs appears twice.
export interface EntityFindings {
  readonly entity: Entity;
  readonly relations: readonly Relation[];
  readonly attributes: readonly Attribute[];
}

// Where the knowledge graph is kept, as the core sees it: it says WHAT must be stored and read, never
// HOW. An in-memory list and a Memgraph database both fit behind this; the code that uses it cannot
// tell them apart.
//
// `save` and `findEntity` are asynchronous because a real database answers later; an in-memory
// repository simply returns an already finished promise.
//
// `findEntity` answers `null` when no relation and no attribute mentions the entity: an entity only
// exists in the graph because something mentions it. Two entities are the same when type and value
// are equal, so callers build the `Entity` with `createEntity`, which normalizes both.
//
// EXPAND: the idempotent-write key (so importing the same run twice does not duplicate) belongs to the
// Memgraph adapter step.
export interface GraphRepository {
  save(batch: ImportBatch): Promise<void>;
  findEntity(entity: Entity): Promise<EntityFindings | null>;
}
