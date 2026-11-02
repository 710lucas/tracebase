import { normalizeText } from "../text/index.ts";
import type { Attribute } from "./attribute.ts";
import type { AttributeDTO } from "./attribute-dto.ts";
import { InvalidAttributeError } from "./invalid-attribute-error.ts";

// The only supported way to build an Attribute. Guarantees that `name` is normalized (NFC +
// trim) and not blank, that `values` has at least one value and none is blank, that the values have
// no repeats and are sorted (so the same set always has the same shape), and that the result is
// immutable.
//
// The entity and the provenance are expected to have been built with `createEntity` and
// `createProvenance` already, so they are not validated again here: each rule lives in one place.
//
// SpiderFoot note: the adapter calls this once per group of DESCRIPTOR/SUBENTITY events that share a
// parent event, type and module.
//
// EXPAND: normalize each value too (it is free text from the tool); fold the case of `name` if two
// tools turn out to spell the same attribute differently and we decide that is the core's job.
export function createAttribute(fields: AttributeDTO): Attribute {
  const normalizedName = normalizeText(fields.name);
  if (normalizedName === "") {
    throw new InvalidAttributeError("name must not be blank");
  }
  // A `Set` drops the repeats; the default sort orders by UTF-16 code units, the same on every machine.
  const values = [...new Set(fields.values)].sort();
  if (values.length === 0) {
    throw new InvalidAttributeError("values must not be empty");
  }
  if (values.some((value) => value.trim() === "")) {
    throw new InvalidAttributeError("a value must not be blank");
  }
  // The only cast of the brand: this is where the invariants were just checked.
  return Object.freeze({
    ...fields,
    name: normalizedName,
    values: Object.freeze(values),
  }) as Attribute;
}
