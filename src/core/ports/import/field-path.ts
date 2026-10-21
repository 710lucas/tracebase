// Builds the path strings used in error messages: `relations[2].source.type`.
// Its own file so every parser spells paths the same way.
export const ROOT_PATH = "$";

export function fieldPath(parent: string, key: string): string {
  return parent === ROOT_PATH ? key : `${parent}.${key}`;
}

export function itemPath(parent: string, index: number): string {
  return `${parent}[${index}]`;
}
