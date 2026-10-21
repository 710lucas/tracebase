// Basic hygiene for free-form text that comes from outside the system. Safe for ANY text:
//   1. Unicode NFC: "é" typed as one character and "e" + a combining accent become the same text.
//   2. Trim: leading and trailing whitespace is removed.
//
// It deliberately does nothing else (no case change, no punctuation stripping), because such
// rules depend on what the text means, and the core does not interpret the tools' text.
//
// Used by the places that take free-form text from a tool: entity values and types, relation
// types and attribute names. Without it, " DOMAIN_NAME" and "DOMAIN_NAME" would be two
// different types, and the same word typed with two Unicode forms would be two different nodes.
//
// EXPAND: if a place needs stricter hygiene (collapse inner whitespace, strip control
// characters), add it here once instead of in each caller.
export function normalizeText(text: string): string {
  return text.normalize("NFC").trim();
}
