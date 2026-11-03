import { InvalidProvenanceError } from "./invalid-provenance-error.ts";
import type { Provenance } from "./provenance.ts";
import type { ProvenanceDTO } from "./provenance-dto.ts";

// Upper and lower bound of the confidence scale (named so there are no magic numbers).
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 100;

// The only supported way to build a Provenance. Guarantees:
//   - `tool` and `run` are not blank;
//   - `recordRefs`, when present, has at least one reference and none is blank (a blank reference
//     points at nothing); repeats are dropped and the list is sorted, so the same references always
//     have the same shape;
//   - `confidence`, when present, is a number between 0 and 100;
//   - `observedAt` and `recordedAt`, when present, are non-negative integers (epoch milliseconds);
//   - the result is immutable.
//
// SpiderFoot note: if the adapter gets a confidence outside 0-100 or an unusable `generated`,
// it receives an InvalidProvenanceError and decides what to do; the core never stores a
// provenance it cannot trust.
//
// EXPAND: validate `module` is not blank when present, if real data shows that can happen.
export function createProvenance(fields: ProvenanceDTO): Provenance {
  if (fields.tool.trim() === "") {
    throw new InvalidProvenanceError("tool must not be blank");
  }
  if (fields.run.trim() === "") {
    throw new InvalidProvenanceError("run must not be blank");
  }
  const recordRefs =
    fields.recordRefs === undefined ? undefined : normalizeRecordRefs(fields.recordRefs);
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

  if (
    fields.recordedAt !== undefined &&
    !(Number.isInteger(fields.recordedAt) && fields.recordedAt >= 0)
  ) {
    throw new InvalidProvenanceError(
      "recordedAt must be a non-negative integer (epoch milliseconds)",
    );
  }

  // The only cast of the brand: this is where the invariants were just checked.
  return Object.freeze({
    ...fields,
    ...(recordRefs !== undefined && { recordRefs }),
  }) as Provenance;
}

// A `Set` drops the repeats; the default sort orders by UTF-16 code units, the same on every machine.
function normalizeRecordRefs(recordRefs: readonly string[]): readonly string[] {
  const unique = [...new Set(recordRefs)].sort();
  if (unique.length === 0) {
    throw new InvalidProvenanceError("recordRefs must not be empty when present");
  }
  if (unique.some((reference) => reference.trim() === "")) {
    throw new InvalidProvenanceError("a record reference must not be blank");
  }

  return Object.freeze(unique);
}
