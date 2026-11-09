import { z } from "zod";
import { MATCH_MODES, QUERY_MODES } from "../../../core/ports/graph-repository/index.ts";

// The shape of the JSON body of `POST /graph/query` (documented in `docs/graph-read.md`). It only describes
// structure: which fields exist and their JSON types. What the values may be (a blank text, a `limit` below 1)
// stays with the core (`resolveEntityQuery`), so each rule lives in one place; only the time limit, which the
// core does not know, is checked here.
//
// `strictObject` rejects fields we do not know, so a typo such as `includeHistroy` is an error instead of a
// condition silently lost.
const valueConditionSchema = z.strictObject({
  text: z.string(),
  match: z.enum(MATCH_MODES).optional(),
});

const attributeConditionSchema = z.strictObject({
  name: z.string(),
  qualifier: z.string().optional(),
  text: z.string().optional(),
  match: z.enum(MATCH_MODES).optional(),
});

const provenanceFilterSchema = z.strictObject({
  tool: z.string().optional(),
  module: z.string().optional(),
  run: z.string().optional(),
});

export const entityQuerySchema = z.strictObject({
  types: z.array(z.string()).optional(),
  value: valueConditionSchema.optional(),
  attributes: z.array(attributeConditionSchema).optional(),
  provenance: provenanceFilterSchema.optional(),
  includeHistory: z.boolean().optional(),
  mode: z.enum(QUERY_MODES).optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
  snippetLength: z.number().optional(),
  // How long the read may take, in milliseconds, as in the other reads (`QueryOptions`).
  timeoutMs: z.number().int().min(1).optional(),
});

export type EntityQueryBody = z.infer<typeof entityQuerySchema>;
