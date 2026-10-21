import { InvalidProvenanceError } from "./invalid-provenance-error.ts";
import type { Provenance } from "./provenance.ts";

// Upper and lower bound of the confidence scale (named so there are no magic numbers).
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 100;

// The only supported way to build a Provenance. Guarantees:
//   - `tool` and `run` are not blank;
//   - `recordRef`, when present, is not blank (a blank reference points at nothing);
//   - `confidence`, when present, is a number between 0 and 100;
//   - `observedAt`, when present, is a non-negative integer (epoch milliseconds);
//   - the result is immutable.
//
// SpiderFoot note: if the adapter gets a confidence outside 0-100 or an unusable `generated`,
// it receives an InvalidProvenanceError and decides what to do; the core never stores a
// provenance it cannot trust.
//
// EXPAND: validate `module` is not blank when present, if real data shows that can happen.
export function createProvenance(fields: Provenance): Provenance {
  if (fields.tool.trim() === "") {
    throw new InvalidProvenanceError("tool must not be blank");
  }
  if (fields.run.trim() === "") {
    throw new InvalidProvenanceError("run must not be blank");
  }
  if (fields.recordRef !== undefined && fields.recordRef.trim() === "") {
    throw new InvalidProvenanceError("recordRef must not be blank when present");
  }
  if (
    fields.confidence !== undefined &&
    !(fields.confidence >= MIN_CONFIDENCE && fields.confidence <= MAX_CONFIDENCE)
  ) {
    throw new InvalidProvenanceError(
      `confidence must be between ${MIN_CONFIDENCE} and ${MAX_CONFIDENCE}`,
    );
  }
  if (
    fields.observedAt !== undefined &&
    !(Number.isInteger(fields.observedAt) && fields.observedAt >= 0)
  ) {
    throw new InvalidProvenanceError(
      "observedAt must be a non-negative integer (epoch milliseconds)",
    );
  }
  return Object.freeze({ ...fields });
}
