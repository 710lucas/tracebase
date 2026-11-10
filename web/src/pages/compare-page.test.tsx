import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { failure, ok, stubApi } from "../test/stub-api.ts";
import { renderApp } from "../test/render-app.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The API lists the runs most recently received first.
const RUNS = {
  runs: [
    { tool: "spiderfoot", run: "NEW", relations: 10, attributes: 1, receivedAt: 3000 },
    { tool: "spiderfoot", run: "MID", relations: 5, attributes: 0, receivedAt: 2000 },
    { tool: "spiderfoot", run: "OLD", relations: 1, attributes: 0, receivedAt: 1000 },
  ],
};

const group = (
  entities: { type: string; value: string }[],
  total = entities.length,
  truncated = false,
) => ({
  total,
  byType: [...new Set(entities.map(({ type }) => type))].map((type) => ({
    type,
    count: entities.filter((entity) => entity.type === type).length,
  })),
  entities,
  truncated,
});

const comparison = (a: string, b: string) => ({
  a: { tool: "spiderfoot", run: a },
  b: { tool: "spiderfoot", run: b },
  onlyA: group([{ type: "DOMAIN_NAME", value: "gone.example.com" }]),
  both: group([{ type: "IP_ADDRESS", value: "10.0.0.1" }]),
  onlyB: group([
    { type: "DOMAIN_NAME", value: "new.example.com" },
    { type: "DOMAIN_NAME", value: "newer.example.com" },
  ]),
});

const url = (a: string, b: string) =>
  `/imports/compare?aTool=spiderfoot&aRun=${a}&bTool=spiderfoot&bRun=${b}&limit=50`;

test("compares the two most recent runs by default, the older one first", async () => {
  const { calls } = stubApi({
    "/imports": ok(RUNS),
    [url("MID", "NEW")]: ok(comparison("MID", "NEW")),
  });

  renderApp("/compare");

  expect(await screen.findByText("gone.example.com")).toBeTruthy();
  expect(screen.getByText("new.example.com")).toBeTruthy();
  expect(calls).toEqual(["/imports", url("MID", "NEW")]);
});

test("shows how many entities are in each group", async () => {
  stubApi({ "/imports": ok(RUNS), [url("MID", "NEW")]: ok(comparison("MID", "NEW")) });

  renderApp("/compare");

  await screen.findByText("gone.example.com");
  expect(screen.getByText("Only in the first (gone in the second) (1)")).toBeTruthy();
  expect(screen.getByText("Only in the second (new) (2)")).toBeTruthy();
  expect(screen.getByText("In both (1)")).toBeTruthy();
});

test("has a table by type with the three counts", async () => {
  stubApi({ "/imports": ok(RUNS), [url("MID", "NEW")]: ok(comparison("MID", "NEW")) });

  renderApp("/compare");

  await screen.findByText("gone.example.com");
  const rows = within(screen.getAllByRole("table")[0] as HTMLElement)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);
  // Type, only in the first, in both, only in the second; one row for each type.
  expect(rows).toEqual(["DOMAIN_NAME", "1", "0", "2", "IP_ADDRESS", "0", "1", "0"]);
});

test("uses the runs of the address", async () => {
  const { calls } = stubApi({
    "/imports": ok(RUNS),
    [url("OLD", "MID")]: ok(comparison("OLD", "MID")),
  });

  renderApp("/compare?aTool=spiderfoot&aRun=OLD&bTool=spiderfoot&bRun=MID");

  await screen.findByText("gone.example.com");
  expect(calls).toEqual(["/imports", url("OLD", "MID")]);
});

test("choosing another run compares again", async () => {
  const { calls } = stubApi({
    "/imports": ok(RUNS),
    [url("MID", "NEW")]: ok(comparison("MID", "NEW")),
    [url("OLD", "NEW")]: ok(comparison("OLD", "NEW")),
  });

  renderApp("/compare");
  await screen.findByText("gone.example.com");
  fireEvent.change(screen.getByLabelText("First run"), {
    target: { value: JSON.stringify(["spiderfoot", "OLD"]) },
  });

  await vi.waitFor(() => expect(calls).toContain(url("OLD", "NEW")));
});

test("says when a group is cut and how many there are", async () => {
  stubApi({
    "/imports": ok(RUNS),
    [url("MID", "NEW")]: ok({
      ...comparison("MID", "NEW"),
      onlyB: group([{ type: "DOMAIN_NAME", value: "new.example.com" }], 700, true),
    }),
  });

  renderApp("/compare");

  expect(await screen.findByText("The first 1 of 700, by value.")).toBeTruthy();
});

test("a group with nothing says none", async () => {
  stubApi({
    "/imports": ok(RUNS),
    [url("MID", "NEW")]: ok({ ...comparison("MID", "NEW"), onlyA: group([]) }),
  });

  renderApp("/compare");

  await screen.findByText("new.example.com");
  expect(screen.getByText("None.")).toBeTruthy();
});

test("needs two runs", async () => {
  stubApi({ "/imports": ok({ runs: [RUNS.runs[0]] }) });

  renderApp("/compare");

  expect(
    await screen.findByText(/Two runs are needed to compare, and the graph has 1/),
  ).toBeTruthy();
});

test("says so when a run of the address is not in the graph", async () => {
  stubApi({ "/imports": ok(RUNS), [url("OLD", "MID")]: failure(404, "run not found") });

  renderApp("/compare?aTool=spiderfoot&aRun=OLD&bTool=spiderfoot&bRun=MID");

  expect(await screen.findByText("One of the runs is not in the graph.")).toBeTruthy();
});

test("shows the error when the comparison fails", async () => {
  stubApi({ "/imports": ok(RUNS), [url("MID", "NEW")]: failure(504, "Query exceeded 30 s") });

  renderApp("/compare");

  expect(await screen.findByText(/Query exceeded 30 s/)).toBeTruthy();
});

test("is a section of the page frame", async () => {
  stubApi({ "/imports": ok(RUNS), [url("MID", "NEW")]: ok(comparison("MID", "NEW")) });

  renderApp("/compare");

  expect(await screen.findByRole("link", { name: "Compare" })).toBeTruthy();
});
