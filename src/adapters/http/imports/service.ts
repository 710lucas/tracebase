import type { ImportPayload } from "./import-payload-schema.ts";
import { importPayloadToDomain } from "./import-payload-to-domain.ts";

export interface ImportResult {
  relations: number;
  attributes: number;
}

// Service of the imports module: carries out the import using the core and answers the controller with
// a plain result. It knows nothing about HTTP.
//
// Domain errors (a value the domain rejects) are not caught here; they reach the controller, which
// decides how to answer them.
//
// For now the domain objects are only logged; nothing is stored.
//
// EXPAND: hand the objects to the repository. Cut the log of very large batches (a SpiderFoot scan can
// be thousands of items) once real data shows the size.
export function importBatch(payload: ImportPayload): ImportResult {
  const { relations, attributes } = importPayloadToDomain(payload);
  console.log(
    `import accepted: ${relations.length} relations, ${attributes.length} attributes`,
    JSON.stringify({ relations, attributes }),
  );
  return { relations: relations.length, attributes: attributes.length };
}
