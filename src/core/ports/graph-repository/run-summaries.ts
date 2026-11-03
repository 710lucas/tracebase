import type { RunSummary } from "./graph-overview.ts";

// Which of the two counts of a `RunSummary` a number belongs to.
export type RunItemKind = "relations" | "attributes";

// Builds the list of `RunSummary` that `GraphRepository.listRuns` answers. It is the one place that knows
// how counts become runs, so every repository (memory, Memgraph) answers in the same way:
//
// - a run is the (`tool`, `run`) pair of the provenance, and is created the first time something carries it;
// - its `receivedAt` is the EARLIEST `recordedAt` given for it, and is absent when none was given;
// - the list is ordered most recently received first, runs with no date last, and runs with the same date
//   by tool and then by run, so the same graph always lists its runs in the same order.
//
// A repository that counts item by item adds 1 for each; one whose database already counted adds the
// total of each group. Both give the same list.
export interface RunSummaries {
  add(
    run: { tool: string; run: string },
    kind: RunItemKind,
    count: number,
    receivedAt?: number,
  ): void;
  toList(): RunSummary[];
}

interface MutableRun {
  tool: string;
  run: string;
  relations: number;
  attributes: number;
  receivedAt?: number;
}

export function createRunSummaries(): RunSummaries {
  const byRun = new Map<string, MutableRun>();

  return {
    add({ tool, run }, kind, count, receivedAt) {
      // A JSON list is one text per (tool, run) pair, so two different pairs never collide.
      const key = JSON.stringify([tool, run]);
      const summary = byRun.get(key) ?? { tool, run, relations: 0, attributes: 0 };

      summary[kind] += count;
      if (receivedAt !== undefined) {
        summary.receivedAt =
          summary.receivedAt === undefined ? receivedAt : Math.min(summary.receivedAt, receivedAt);
      }

      byRun.set(key, summary);
    },

    toList: () =>
      [...byRun.values()].sort(
        (first, second) =>
          (second.receivedAt ?? 0) - (first.receivedAt ?? 0) ||
          first.tool.localeCompare(second.tool) ||
          first.run.localeCompare(second.run),
      ),
  };
}
