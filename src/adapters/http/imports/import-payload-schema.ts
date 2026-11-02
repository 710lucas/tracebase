import { z } from "zod";

// The shape of the JSON a tool sends (documented in `docs/import-payload.md`). It only describes
// structure: which fields exist and their JSON types. What the values may be (not blank, confidence
// between 0 and 100) stays with the domain `create*` functions, so each rule lives in one place.
//
// `strictObject` rejects fields we do not know, so a typo such as `confidance` is an error instead of
// silently lost data.
const entityReferenceSchema = z.strictObject({ type: z.string(), value: z.string() });

const itemProvenanceSchema = z.strictObject({
  recordRef: z.string().optional(),
  module: z.string().optional(),
  confidence: z.number().optional(),
  observedAt: z.number().optional(),
});

const relationSchema = z.strictObject({
  source: entityReferenceSchema,
  target: entityReferenceSchema,
  type: z.string().optional(),
  viaRecordRefs: z.array(z.string()).optional(),
  provenance: itemProvenanceSchema.optional(),
});

const attributeSchema = z.strictObject({
  entity: entityReferenceSchema,
  name: z.string(),
  // Which source or angle of the entity and name the set belongs to (see `attribute.ts`); optional.
  qualifier: z.string().optional(),
  // The whole set of values the tool found together (see `attribute.ts`); the domain refuses an empty
  // list and blank texts.
  values: z.array(z.string()),
  provenance: itemProvenanceSchema.optional(),
});

const batchSourceSchema = z.strictObject({ tool: z.string(), run: z.string() });

export const importPayloadSchema = z.strictObject({
  source: batchSourceSchema,
  relations: z.array(relationSchema).default([]),
  attributes: z.array(attributeSchema).default([]),
});

export type ImportPayloadDTO = z.infer<typeof importPayloadSchema>;
