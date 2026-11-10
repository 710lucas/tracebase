import { expect, test } from "vitest";
import type { ComparedEntities, RunComparison } from "./api/types.ts";
import { describeRun, figuresByType } from "./compare-figures.ts";

const group = (byType: [string, number][]): ComparedEntities => ({
  total: byType.reduce((sum, [, count]) => sum + count, 0),
  byType: byType.map(([type, count]) => ({ type, count })),
  entities: [],
  truncated: false,
});

const comparison: RunComparison = {
  a: { tool: "spiderfoot", run: "A" },
  b: { tool: "spiderfoot", run: "B" },
  onlyA: group([["DOMAIN_NAME", 3]]),
  both: group([
    ["DOMAIN_NAME", 1],
    ["IP_ADDRESS", 2],
  ]),
  onlyB: group([
    ["IP_ADDRESS", 1],
    ["ASN", 1],
  ]),
};

test("puts the three groups side by side for each type", () => {
  expect(figuresByType(comparison)).toEqual([
    { type: "DOMAIN_NAME", onlyA: 3, both: 1, onlyB: 0 },
    { type: "IP_ADDRESS", onlyA: 0, both: 2, onlyB: 1 },
    { type: "ASN", onlyA: 0, both: 0, onlyB: 1 },
  ]);
});

test("a type that is in no group is not listed, and no groups give no types", () => {
  expect(
    figuresByType({ ...comparison, onlyA: group([]), both: group([]), onlyB: group([]) }),
  ).toEqual([]);
});

test("types with as many entities come by name", () => {
  const figures = figuresByType({
    ...comparison,
    onlyA: group([["B", 1]]),
    both: group([]),
    onlyB: group([["A", 1]]),
  });

  expect(figures.map(({ type }) => type)).toEqual(["A", "B"]);
});

test("describes a run on one line", () => {
  expect(describeRun({ tool: "spiderfoot", run: "D0366C3F" })).toBe("spiderfoot · run D0366C3F");
});
