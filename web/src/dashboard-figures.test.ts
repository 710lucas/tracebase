import { expect, test } from "vitest";
import type { RunSummary } from "./api/types.ts";
import { growthOverTime, shareOf, summarizeByTool } from "./dashboard-figures.ts";

const run = (
  tool: string,
  name: string,
  relations: number,
  attributes: number,
  receivedAt?: number,
): RunSummary => ({
  tool,
  run: name,
  relations,
  attributes,
  ...(receivedAt !== undefined && { receivedAt }),
});

test("sums what each tool brought and puts the one with the most relations first", () => {
  const figures = summarizeByTool([
    run("small", "r1", 1, 2),
    run("spiderfoot", "r1", 10, 1),
    run("spiderfoot", "r2", 5, 4),
  ]);

  expect(figures).toEqual([
    { tool: "spiderfoot", runs: 2, relations: 15, attributes: 5 },
    { tool: "small", runs: 1, relations: 1, attributes: 2 },
  ]);
});

test("tools with the same number of relations come by name", () => {
  const figures = summarizeByTool([run("b", "r1", 1, 0), run("a", "r1", 1, 0)]);

  expect(figures.map(({ tool }) => tool)).toEqual(["a", "b"]);
});

test("no runs, no tools", () => {
  expect(summarizeByTool([])).toEqual([]);
});

test("growth goes from the first import to the last, accumulating what each brought", () => {
  const growth = growthOverTime([run("t", "late", 5, 1, 300), run("t", "early", 10, 2, 100)]);

  expect(
    growth.map(({ run: name, accumulatedRelations, accumulatedAttributes }) => [
      name,
      accumulatedRelations,
      accumulatedAttributes,
    ]),
  ).toEqual([
    ["early", 10, 2],
    ["late", 15, 3],
  ]);
});

test("a run with no date comes last and keeps the order it had", () => {
  const growth = growthOverTime([
    run("t", "undated-1", 1, 0),
    run("t", "dated", 1, 0, 100),
    run("t", "undated-2", 1, 0),
  ]);

  expect(growth.map(({ run: name }) => name)).toEqual(["dated", "undated-1", "undated-2"]);
});

test("does not change the list it was given", () => {
  const given = [run("t", "b", 1, 0, 2), run("t", "a", 1, 0, 1)];

  growthOverTime(given);

  expect(given.map(({ run: name }) => name)).toEqual(["b", "a"]);
});

test("a bar is a percentage of the biggest value, and 0 when there is nothing to compare", () => {
  expect(shareOf(50, 200)).toBe(25);
  expect(shareOf(200, 200)).toBe(100);
  expect(shareOf(0, 0)).toBe(0);
  expect(shareOf(5, 0)).toBe(0);
});
