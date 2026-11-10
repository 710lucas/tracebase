import { expect, test } from "vitest";
import type { Attribute, EntityFindings, Relation } from "./api/types.ts";
import { buildTimeline } from "./entity-timeline.ts";

const entity = { type: "IP_ADDRESS", value: "10.0.0.1" };
const other = { type: "DOMAIN_NAME", value: "a.example.com" };

const relation = (run: string, recordedAt?: number, observedAt?: number): Relation => ({
  source: other,
  target: entity,
  provenance: {
    tool: "spiderfoot",
    run,
    ...(recordedAt !== undefined && { recordedAt }),
    ...(observedAt !== undefined && { observedAt }),
  },
});

const attribute = (
  run: string,
  values: string[],
  recordedAt: number,
  qualifier?: string,
  name = "BANNER",
): Attribute => ({
  name,
  values,
  ...(qualifier !== undefined && { qualifier }),
  provenance: { tool: "spiderfoot", run, recordedAt },
});

const findings = (relations: Relation[], attributes: Attribute[]): EntityFindings => ({
  entity,
  relations,
  attributes,
});

test("lists the runs from the first seen to the last, with what each one found", () => {
  const { runs } = buildTimeline(
    findings(
      [relation("late", 300), relation("early", 100), relation("early", 150)],
      [attribute("early", ["x"], 120)],
    ),
  );

  expect(runs).toEqual([
    {
      tool: "spiderfoot",
      run: "early",
      firstSeen: 100,
      lastSeen: 150,
      relations: 2,
      attributes: 1,
    },
    { tool: "spiderfoot", run: "late", firstSeen: 300, lastSeen: 300, relations: 1, attributes: 0 },
  ]);
});

test("the date the tool gave wins over the date it was received", () => {
  const { runs } = buildTimeline(findings([relation("r", 900, 100)], []));

  expect(runs[0]?.firstSeen).toBe(100);
});

test("a run with no date comes last", () => {
  const { runs } = buildTimeline(findings([relation("undated"), relation("dated", 5)], []));

  expect(runs.map(({ run }) => run)).toEqual(["dated", "undated"]);
  expect(runs[1]?.firstSeen).toBeUndefined();
});

test("the first set of an attribute adds all its values", () => {
  const { changes } = buildTimeline(findings([], [attribute("r1", ["nginx"], 100, "sfp_web")]));

  expect(changes).toEqual([
    {
      name: "BANNER",
      qualifier: "sfp_web",
      tool: "spiderfoot",
      run: "r1",
      at: 100,
      after: ["nginx"],
      added: ["nginx"],
      removed: [],
    },
  ]);
});

test("a later set says what it added and what it removed from the one before", () => {
  const { changes } = buildTimeline(
    findings(
      [],
      [
        attribute("r2", ["apache", "nginx"], 200, "sfp_web"),
        attribute("r1", ["nginx", "php"], 100, "sfp_web"),
      ],
    ),
  );

  expect(
    changes.map(({ run, added, removed, before }) => ({ run, added, removed, before })),
  ).toEqual([
    { run: "r1", added: ["nginx", "php"], removed: [], before: undefined },
    { run: "r2", added: ["apache"], removed: ["php"], before: ["nginx", "php"] },
  ]);
});

test("different names and qualifiers are different histories", () => {
  const { changes } = buildTimeline(
    findings(
      [],
      [
        attribute("r1", ["a"], 100, "q1"),
        attribute("r2", ["b"], 200, "q2"),
        attribute("r3", ["c"], 300, undefined, "OTHER"),
      ],
    ),
  );

  expect(changes.every(({ before }) => before === undefined)).toBe(true);
  expect(changes).toHaveLength(3);
});

test("changes come in time order across attributes", () => {
  const { changes } = buildTimeline(
    findings(
      [],
      [attribute("r2", ["b"], 200, undefined, "B"), attribute("r1", ["a"], 100, undefined, "A")],
    ),
  );

  expect(changes.map(({ name }) => name)).toEqual(["A", "B"]);
});

test("an entity with nothing has an empty timeline", () => {
  expect(buildTimeline(findings([], []))).toEqual({ runs: [], changes: [] });
});
