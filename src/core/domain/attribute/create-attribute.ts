import { normalizeText } from "../text/index.ts";
import type { Attribute } from "./attribute.ts";
import { InvalidAttributeError } from "./invalid-attribute-error.ts";

// The only supported way to build an Attribute. Guarantees that `name` is normalized (NFC +
// trim) and not blank, that `value` is not blank, and that the result is immutable.
//
// The entity and the provenance are expected to have been built with `createEntity` and
// `createProvenance` already, so they are not validated again here: each rule lives in one place.
//
// SpiderFoot note: the adapter calls this once per DESCRIPTOR/SUBENTITY event it keeps.
//
// EXPAND: normalize `value` too (it is free text from the tool); fold the case of `name` if two
// tools turn out to spell the same attribute differently and we decide that is the core's job.
export function createAttribute(fields: Attribute): Attribute {
  const normalizedName = normalizeText(fields.name);
  if (normalizedName === "") {
    throw new InvalidAttributeError("name must not be blank");
  }
  if (fields.value.trim() === "") {
    throw new InvalidAttributeError("value must not be blank");
  }
  return Object.freeze({ ...fields, name: normalizedName });
}
