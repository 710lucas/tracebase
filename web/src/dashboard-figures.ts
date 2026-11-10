import type { RunSummary } from "./api/types.ts";

// The numbers of the dashboard that are not in any route: they are worked out from the list of runs.

export interface ToolFigures {
  tool: string;
  runs: number;
  relations: number;
  attributes: number;
}

// What each tool brought in all its runs, the one with the most relations first (ties by name).
export function summarizeByTool(runs: readonly RunSummary[]): ToolFigures[] {
  const byTool = new Map<string, ToolFigures>();

  for (const run of runs) {
    const figures = byTool.get(run.tool) ?? {
      tool: run.tool,
      runs: 0,
      relations: 0,
      attributes: 0,
    };
    figures.runs += 1;
    figures.relations += run.relations;
    figures.attributes += run.attributes;
    byTool.set(run.tool, figures);
  }

  return [...byTool.values()].sort(
    (first, second) => second.relations - first.relations || first.tool.localeCompare(second.tool),
  );
}

export interface GrowthPoint {
  tool: string;
  run: string;
  receivedAt?: number;
  relations: number;
  attributes: number;
  // What the graph held in relations and attributes once this run was in (every earlier run included).
  accumulatedRelations: number;
  accumulatedAttributes: number;
}

// How the graph grew from one import to the next: the runs from the first received to the last, each with what
// it brought and the running total. A run with no date has no place in time, so it comes last. Counts are what
// each run stored (a finding an earlier run had already stored is not counted again), so the totals add up.
export function growthOverTime(runs: readonly RunSummary[]): GrowthPoint[] {
  const chronological = [...runs].sort(
    (first, second) =>
      (first.receivedAt ?? Number.POSITIVE_INFINITY) -
        (second.receivedAt ?? Number.POSITIVE_INFINITY) || 0,
  );

  let accumulatedRelations = 0;
  let accumulatedAttributes = 0;

  return chronological.map((run) => {
    accumulatedRelations += run.relations;
    accumulatedAttributes += run.attributes;

    return { ...run, accumulatedRelations, accumulatedAttributes };
  });
}

// How long a bar is, as a percentage of the biggest value (0 when there is nothing to compare with).
export function shareOf(value: number, biggest: number): number {
  return biggest <= 0 ? 0 : Math.round((value / biggest) * 100);
}
