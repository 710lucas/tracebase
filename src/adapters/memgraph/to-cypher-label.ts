// What a relation with no usable type is called in the graph.
const FALLBACK_EDGE_LABEL = "RELATED";

// Labels the adapter uses itself. An entity whose type normalizes to one of these would be mixed up
// with the adapter's own nodes, so it gets no type label (it still has `:Entity` and its `type`).
const RESERVED_NODE_LABELS = new Set(["ENTITY", "ATTRIBUTE"]);

// A safe label: starts with a letter, then only letters, digits or `_` until the end of the text.
const SAFE_LABEL = /^[A-Z][A-Z0-9_]*$/;

// A label cannot be a query parameter, so it is written into the query text. That is only safe for a
// text that cannot carry anything but letters, digits and underscores, which is what this builds. The
// exact text the tool sent is kept elsewhere, as a property.
//
// Accents are removed, everything that is not a letter or digit becomes `_`, repeated or edge
// underscores are dropped, and the result is upper case. Different spellings may meet in one label
// (`resolves-to` and `Resolves To`), which is why the original text is kept. A text that cannot make a
// label (empty, or starting with a digit) gives `null`.
function normalizeLabel(text: string): string | null {
  const label = text
    .normalize("NFD") // Splits accented letters into the letter plus a separate accent mark (`ã` becomes `a` + `~`).
    .replace(/\p{M}/gu, "") // Removes those accent marks (`\p{M}` is any Unicode combining mark), leaving `a`.
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_") // Each run of characters that is not a letter or digit (spaces, `-`, `.`, `/`, `_`...) becomes one `_`.
    .replace(/^_+|_+$/g, ""); // Removes `_` from the start and from the end of the text.

  return SAFE_LABEL.test(label) ? label : null;
}

// The label of the edge that stores a relation: its type, normalized, or `RELATED` when the tool sent no
// type or one that cannot make a label (SpiderFoot sends none).
export function toEdgeLabel(relationType: string | undefined): string {
  return (relationType === undefined ? null : normalizeLabel(relationType)) ?? FALLBACK_EDGE_LABEL;
}

// The type label of an entity node, next to `:Entity`, or `null` when the type cannot make a safe label
// or would clash with a label the adapter uses.
export function toEntityLabel(entityType: string): string | null {
  const label = normalizeLabel(entityType);

  return label === null || RESERVED_NODE_LABELS.has(label) ? null : label;
}
