import type { Attribute } from "../../domain/attribute/index.ts";
import type { Relation } from "../../domain/relation/index.ts";
import type { ImportSource } from "./import-source.ts";

// A validated import: what the core receives from any OSINT tool, already turned into domain
// objects. Produced only by `parseImportBatch`, so holding one means the payload was checked.
//
// There is no list of entities on purpose: an entity exists because a relation or an attribute
// mentions it (see `docs/architecture.md`). The ingestion use case creates it on first mention.
//
// EXPAND: a way to import an entity that has no relation and no attribute yet (the SpiderFoot seed
// is the known case; see "seed provenance" in `docs/roadmap.md`, step 4).
export interface ImportBatch {
  readonly source: ImportSource;
  readonly relations: readonly Relation[];
  readonly attributes: readonly Attribute[];
}
