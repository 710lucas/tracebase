// How Memgraph is asked to ignore case. Its `toLower` only changes the letters of the ASCII alphabet
// (`toLower('CAFÉ')` is `'cafÉ'`), so comparing `toLower(value) CONTAINS toLower(text)` would treat `É` and `é`
// as different letters, while the in-memory repository ignores the case of every letter. The way out is to
// write the text in each way its accented letters may appear in a value and to ask whether the lowered value
// contains ANY of them: the letters of the ASCII alphabet are lowered here (the database lowers them in the
// value), and each different letter that has an upper and a lower case, outside the ASCII alphabet, is tried
// in both. A text with `ç` and `ã` gives 4 variants. Letters are varied by kind, not by place, so `ã` is
// `ã` or `Ã` all through the text, which is how a word is written.
//
// Past `MAX_VARIED_LETTERS` different letters the combinations would grow too fast: only the text with all of
// them in lower case and the text with all of them in upper case are tried. Letters whose case does not
// pair one to one (`ß`, `İ`) are tried as the language gives them and no more.
export const MAX_VARIED_LETTERS = 4;

export function caseVariants(text: string): string[] {
  const characters = Array.from(text);
  const casedLetters = [
    ...new Set(characters.filter((character) => !isAscii(character) && hasCase(character))),
  ];

  if (casedLetters.length > MAX_VARIED_LETTERS) {
    return [
      lowerAscii(characters.map((character) => lowerLetter(character)).join("")),
      lowerAscii(characters.map((character) => upperLetter(character)).join("")),
    ];
  }

  let variants = [characters];
  for (const letter of casedLetters) {
    const forms = [...new Set([letter.toLowerCase(), letter.toUpperCase()])];
    variants = variants.flatMap((variant) =>
      forms.map((form) => variant.map((character) => (character === letter ? form : character))),
    );
  }

  return [...new Set(variants.map((variant) => lowerAscii(variant.join(""))))];
}

function isAscii(character: string): boolean {
  return character.charCodeAt(0) < 128;
}

function hasCase(character: string): boolean {
  return character.toLowerCase() !== character.toUpperCase();
}

function lowerAscii(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function lowerLetter(character: string): string {
  return isAscii(character) ? character : character.toLowerCase();
}

function upperLetter(character: string): string {
  return isAscii(character) ? character : character.toUpperCase();
}
