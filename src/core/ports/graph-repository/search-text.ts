// Finding a text inside a value, ignoring case, and cutting out the part of the value that is shown.

// Where the text starts in the value (a position in UTF-16 units, like `String.indexOf`), or -1. Case is
// ignored and the text is taken literally: a `.` in it is a dot, not "any character". A regular
// expression with the `i` and `u` flags is used instead of lowercasing both sides because lowercasing can
// change the length of a text and so move the position.
export function indexOfText(value: string, text: string): number {
  return value.search(new RegExp(escapeForRegExp(text), "iu"));
}

// The part of `value` to show for a match of `text`: at most `length` characters, with the text in the
// middle when there is room, and an ellipsis (`…`, not counted in the length) at each end that was cut. A
// value that fits is shown whole. When the text itself is longer than `length`, the snippet starts at the
// text and is cut at `length`. Characters are counted as whole code points, so one is never split in half.
export function createSnippet(value: string, text: string, length: number): string {
  const characters = Array.from(value);
  if (characters.length <= length) {
    return value;
  }

  const position = indexOfText(value, text);
  const textStart = position < 0 ? 0 : Array.from(value.slice(0, position)).length;
  const textLength = Array.from(text).length;
  const room = length - textLength;

  let start = room <= 0 ? textStart : Math.max(0, textStart - Math.floor(room / 2));
  const end = Math.min(characters.length, start + length);
  start = Math.max(0, end - length);

  return (
    (start > 0 ? "…" : "") +
    characters.slice(start, end).join("") +
    (end < characters.length ? "…" : "")
  );
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
