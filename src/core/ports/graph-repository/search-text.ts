// Finding a text inside a value in one of the ways of `MatchMode`, and cutting out the part of the value that
// is shown.
import { foldText } from "../../domain/text/index.ts";
import { DEFAULT_MATCH_MODE, type MatchMode } from "./match-mode.ts";

// Where the text starts in the value (a position in UTF-16 units, like `String.indexOf`), or -1. The text is
// always taken literally: a `.` in it is a dot, not "any character". `exact` finds it only when the value is
// the text, `contains` anywhere letter for letter, and `insensitive` (the default) anywhere ignoring case and
// accents. The folding (`foldText`) can change the length of a text, so the position found in the folded value
// is told back in the original one.
export function indexOfText(
  value: string,
  text: string,
  match: MatchMode = DEFAULT_MATCH_MODE,
): number {
  if (match === "exact") {
    return value === text ? 0 : -1;
  }
  if (match === "contains") {
    return value.indexOf(text);
  }

  const foldedValue = foldText(value);
  const position = foldedValue.folded.indexOf(foldText(text).folded);
  return position < 0 ? -1 : (foldedValue.origins[position] ?? -1);
}

// The part of `value` to show for a match of `text`: at most `length` characters, with the text in the
// middle when there is room, and an ellipsis (`…`, not counted in the length) at each end that was cut. A
// value that fits is shown whole. When the text itself is longer than `length`, the snippet starts at the
// text and is cut at `length`. Characters are counted as whole code points, so one is never split in half.
export function createSnippet(
  value: string,
  text: string,
  length: number,
  match: MatchMode = DEFAULT_MATCH_MODE,
): string {
  const characters = Array.from(value);
  if (characters.length <= length) {
    return value;
  }

  const position = indexOfText(value, text, match);
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
