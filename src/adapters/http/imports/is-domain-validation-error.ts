import { InvalidAttributeError } from "../../../core/domain/attribute/index.ts";
import { InvalidEntityError } from "../../../core/domain/entity/index.ts";
import { InvalidProvenanceError } from "../../../core/domain/provenance/index.ts";
import { InvalidRelationError } from "../../../core/domain/relation/index.ts";

// The errors the domain raises when a value is not acceptable (blank, out of range). They are the
// sender's mistake, so the imports module answers them with a 400; any other error is ours and is left
// to Express (500).
const DOMAIN_VALIDATION_ERRORS = [
  InvalidAttributeError,
  InvalidEntityError,
  InvalidProvenanceError,
  InvalidRelationError,
];

export function isDomainValidationError(error: unknown): error is Error {
  return DOMAIN_VALIDATION_ERRORS.some((errorClass) => error instanceof errorClass);
}
