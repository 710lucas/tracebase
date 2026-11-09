import { foldLetter } from "../../core/domain/text/index.ts";
import type { MatchMode } from "../../core/ports/graph-repository/index.ts";

// How a search text is compared with a value inside a Cypher query, for each `MatchMode`:
// - `exact`: `value = $text`;
// - `contains`: `value CONTAINS $text`;
// - `insensitive`: `value =~ $pattern`, a regular expression that matches a value having the text inside it,
//   with every letter of the text written as the class of all the forms of that letter (`é` becomes
//   `[eEéÉèÈêÊëË...]`), so case and accents are ignored in both directions.
//
// A regular expression is used for `insensitive` because Memgraph has no function for it: `toLower` only changes
// the ASCII letters (`toLower('CAFÉ')` is `'cafÉ'`), `(?i)` is not supported and no function removes accents.
// The classes are made from the letters of the Latin blocks of Unicode, folded the same way as the in-memory
// repository folds them (`foldLetter`), so both answer alike; the letters of other alphabets get the pair of
// their lower and upper case.
export interface MatchPredicate {
  // The condition for a value, written for the expression given (`n.value`, `candidate`...).
  readonly condition: (expression: string) => string;
  // The parameters the condition uses; they go with the query.
  readonly parameters: Readonly<Record<string, string>>;
}

export function createMatchPredicate(text: string, match: MatchMode): MatchPredicate {
  if (match === "exact") {
    return { condition: (value) => `${value} = $text`, parameters: { text } };
  }
  if (match === "contains") {
    return { condition: (value) => `${value} CONTAINS $text`, parameters: { text } };
  }
  return { condition: (value) => `${value} =~ $pattern`, parameters: { pattern: toPattern(text) } };
}

// The regular expression for a value that has the text inside. `[\s\S]` is "any character, line breaks
// included", which `.` is not.
function toPattern(text: string): string {
  return `[\\s\\S]*${Array.from(text).map(toClass).join("")}[\\s\\S]*`;
}

function toClass(character: string): string {
  const forms = new Set([
    character,
    character.toLowerCase(),
    character.toUpperCase(),
    ...(formsOfLetter().get(foldLetter(character)) ?? []),
  ]);
  // Memgraph reads a class `[...]` byte by byte, which splits a letter with an accent in half. So the ASCII
  // forms go in a class and each other form is an alternative of its own, which is compared as a whole.
  const ascii = [...forms].filter((form) => form.charCodeAt(0) < 128);
  const others = [...forms].filter((form) => form.charCodeAt(0) >= 128);
  const asciiClass = ascii.length > 0 ? [`[${ascii.map(escapeInClass).join("")}]`] : [];
  const alternatives = [...asciiClass, ...others];

  return alternatives.length === 1 ? (alternatives[0] ?? "") : `(?:${alternatives.join("|")})`;
}

function escapeInClass(character: string): string {
  return /[\\\]^-]/.test(character) ? `\\${character}` : character;
}

// Every letter of the Latin blocks, grouped by its folded form (`e` has `e`, `E`, `é`, `É`...). Made once, the
// first time an `insensitive` match needs it.
let latinForms: Map<string, string[]> | undefined;

function formsOfLetter(): Map<string, string[]> {
  if (latinForms !== undefined) {
    return latinForms;
  }

  latinForms = new Map();
  for (const [first, last] of [
    [0x41, 0x24f],
    [0x1e00, 0x1eff],
  ] as const) {
    for (let codePoint = first; codePoint <= last; codePoint++) {
      const letter = String.fromCodePoint(codePoint);
      const folded = foldLetter(letter);
      latinForms.set(folded, [...(latinForms.get(folded) ?? []), letter]);
    }
  }
  return latinForms;
}
