// The order of two texts, character by character, as a database sorts them, and not with the language-aware
// order of `localeCompare`: a repository that lets its database pick the first rows and one that sorts in
// memory then choose the same ones. Negative when `first` comes first, positive when `second` does, 0 when
// they are equal.
export function compareText(first: string, second: string): number {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}
