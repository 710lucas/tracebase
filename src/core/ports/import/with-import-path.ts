import { InvalidAttributeError } from "../../domain/attribute/index.ts";
import { InvalidEntityError } from "../../domain/entity/index.ts";
import { InvalidProvenanceError } from "../../domain/provenance/index.ts";
import { InvalidRelationError } from "../../domain/relation/index.ts";
import { InvalidImportBatchError } from "./invalid-import-batch-error.ts";

const DOMAIN_ERRORS = [
  InvalidAttributeError,
  InvalidEntityError,
  InvalidProvenanceError,
  InvalidRelationError,
];

// Runs `build` (a call to a domain `create*` function) and, if the domain rejects the content,
// re-raises it as an InvalidImportBatchError pointing at `path`.
//
// Why: the domain knows the rules but not where in the payload the value came from; the parser
// knows the place. Joining them here keeps the domain free of any notion of "payload" and still
// gives the sender a precise location. Errors that are not domain rejections are bugs and pass
// through untouched.
export function withImportPath<T>(path: string, build: () => T): T {
  try {
    return build();
  } catch (error) {
    if (DOMAIN_ERRORS.some((domainError) => error instanceof domainError)) {
      throw new InvalidImportBatchError(path, (error as Error).message);
    }
    throw error;
  }
}
