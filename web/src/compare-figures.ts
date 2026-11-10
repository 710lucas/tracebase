import type { RunComparison } from "./api/types.ts";

export interface TypeFigures {
  type: string;
  onlyA: number;
  both: number;
  onlyB: number;
}

// The three groups of a comparison put side by side by entity type: for each type, how many entities only the first
// run saw, both saw and only the second saw. The type with the most entities in all comes first, ties by name.
export function figuresByType(comparison: RunComparison): TypeFigures[] {
  const byType = new Map<string, TypeFigures>();

  function add(group: "onlyA" | "both" | "onlyB") {
    for (const { type, count } of comparison[group].byType) {
      const figures = byType.get(type) ?? { type, onlyA: 0, both: 0, onlyB: 0 };
      figures[group] = count;
      byType.set(type, figures);
    }
  }
  add("onlyA");
  add("both");
  add("onlyB");

  const sum = ({ onlyA, both, onlyB }: TypeFigures) => onlyA + both + onlyB;
  return [...byType.values()].sort(
    (first, second) => sum(second) - sum(first) || first.type.localeCompare(second.type),
  );
}

// A run as one line for a selector and a heading: "spiderfoot · run D0366C3F".
export function describeRun(run: { tool: string; run: string }): string {
  return `${run.tool} · run ${run.run}`;
}
