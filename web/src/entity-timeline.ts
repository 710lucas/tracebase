import type { EntityFindings } from "./api/types.ts";
import { seenAt } from "./format.ts";

// What one run found about the entity.
export interface TimelineRun {
  tool: string;
  run: string;
  firstSeen?: number;
  lastSeen?: number;
  relations: number;
  attributes: number;
}

// One step in the history of an attribute (a name and qualifier): the set of values a run reported, and how it differs
// from the set before it. The first set has no `before`, so everything in it is `added`.
export interface AttributeChange {
  name: string;
  qualifier?: string;
  tool: string;
  run: string;
  at?: number;
  before?: string[];
  after: string[];
  added: string[];
  removed: string[];
}

export interface EntityTimeline {
  runs: TimelineRun[];
  changes: AttributeChange[];
}

// The history of one entity worked out from what the page already has: the runs that found something about it, from
// the first to the last seen (a run with no date comes last), and, for each attribute, the sets it had one after the
// other with what each one added and removed. A set is the whole of what a tool found together, so the difference is
// between sets and not between single values.
export function buildTimeline(findings: EntityFindings): EntityTimeline {
  return { runs: runsOf(findings), changes: changesOf(findings) };
}

function runsOf(findings: EntityFindings): TimelineRun[] {
  const byRun = new Map<string, TimelineRun>();

  function add(
    provenance: { tool: string; run: string },
    seen: number | undefined,
    kind: "relations" | "attributes",
  ) {
    const key = JSON.stringify([provenance.tool, provenance.run]);
    const timeline = byRun.get(key) ?? {
      tool: provenance.tool,
      run: provenance.run,
      relations: 0,
      attributes: 0,
    };
    timeline[kind] += 1;
    if (seen !== undefined) {
      timeline.firstSeen = Math.min(timeline.firstSeen ?? seen, seen);
      timeline.lastSeen = Math.max(timeline.lastSeen ?? seen, seen);
    }
    byRun.set(key, timeline);
  }

  for (const { provenance } of findings.relations) add(provenance, seenAt(provenance), "relations");
  for (const { provenance } of findings.attributes)
    add(provenance, seenAt(provenance), "attributes");

  return [...byRun.values()].sort(
    (first, second) =>
      (first.firstSeen ?? Number.POSITIVE_INFINITY) -
        (second.firstSeen ?? Number.POSITIVE_INFINITY) || 0,
  );
}

function changesOf(findings: EntityFindings): AttributeChange[] {
  const byAttribute = new Map<string, EntityFindings["attributes"]>();
  for (const attribute of findings.attributes) {
    const key = JSON.stringify([attribute.name, attribute.qualifier ?? null]);
    byAttribute.set(key, [...(byAttribute.get(key) ?? []), attribute]);
  }

  const changes: AttributeChange[] = [];
  for (const sets of byAttribute.values()) {
    const inOrder = [...sets].sort(
      (first, second) => (seenAt(first.provenance) ?? 0) - (seenAt(second.provenance) ?? 0),
    );

    inOrder.forEach((attribute, index) => {
      const before = inOrder[index - 1]?.values;
      const at = seenAt(attribute.provenance);
      changes.push({
        name: attribute.name,
        ...(attribute.qualifier !== undefined && { qualifier: attribute.qualifier }),
        tool: attribute.provenance.tool,
        run: attribute.provenance.run,
        ...(at !== undefined && { at }),
        ...(before !== undefined && { before }),
        after: attribute.values,
        added: attribute.values.filter((value) => !(before ?? []).includes(value)),
        removed: (before ?? []).filter((value) => !attribute.values.includes(value)),
      });
    });
  }

  return changes.sort((first, second) => (first.at ?? Infinity) - (second.at ?? Infinity));
}
