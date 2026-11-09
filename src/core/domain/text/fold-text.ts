// The form of a letter that ignores case and accents, so `É`, `é`, `E` and `e` are the same letter. A letter is
// decomposed (`é` is `e` and an accent mark), the marks are dropped and what is left is lowered. A letter
// with nothing to drop is only lowered, and a character that is not a letter stays as it is.
export function foldLetter(character: string): string {
  return character.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

// A text in the same folded form, plus where each folded unit came from: `origins[i]` is the position (in
// UTF-16 units, like `String.indexOf`) in the original text of the character that gave the unit `i` of
// `folded`. The map is there because folding can change the length of a text, and a position found in the
// folded text has to be told in the original one.
export function foldText(text: string): { folded: string; origins: number[] } {
  let folded = "";
  const origins: number[] = [];
  let position = 0;

  for (const character of text) {
    const letter = foldLetter(character);
    folded += letter;
    for (let unit = 0; unit < letter.length; unit++) {
      origins.push(position);
    }
    position += character.length;
  }

  return { folded, origins };
}
