import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { failure, ok, stubApi } from "../test/stub-api.ts";
import { renderApp } from "../test/render-app.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TYPES = Array.from({ length: 12 }, (_, index) => ({
  type: `TYPE_${index}`,
  count: 100 - index,
}));

function stubDashboard(overrides: Record<string, ReturnType<typeof ok>> = {}) {
  return stubApi({
    "/status": ok({
      storage: "memgraph",
      reachable: true,
      totals: { entities: 5233, relations: 15127, attributes: 4664 },
    }),
    "/graph/types": ok({ types: TYPES }),
    "/imports": ok({
      runs: [
        { tool: "spiderfoot", run: "NEWER", relations: 18, attributes: 0, receivedAt: 2000 },
        { tool: "spiderfoot", run: "OLDER", relations: 100, attributes: 4, receivedAt: 1000 },
      ],
    }),
    "/graph/most-connected?limit=10": ok({
      entities: [
        {
          entity: { type: "IP_ADDRESS", value: "10.0.0.1" },
          total: 283,
          incoming: 1,
          outgoing: 282,
        },
      ],
    }),
    ...overrides,
  });
}

test("shows the totals of the graph", async () => {
  stubDashboard();

  renderApp("/dashboard");

  expect(await screen.findByText((5233).toLocaleString())).toBeTruthy();
  expect(screen.getByText((15127).toLocaleString())).toBeTruthy();
  expect(screen.getByText((4664).toLocaleString())).toBeTruthy();
});

test("shows the ten biggest types and says how many more there are", async () => {
  stubDashboard();

  renderApp("/dashboard");

  expect(await screen.findByText("TYPE_0")).toBeTruthy();
  expect(screen.getByText("TYPE_9")).toBeTruthy();
  expect(screen.queryByText("TYPE_10")).toBeNull();
  expect(screen.getByText(/and 2 more types/)).toBeTruthy();
});

test("sums what each tool brought", async () => {
  stubDashboard();

  renderApp("/dashboard");

  const table = (await screen.findByText("By tool")).nextElementSibling as HTMLElement;
  expect(await within(table).findByText("spiderfoot")).toBeTruthy();
  expect(within(table).getByText("118")).toBeTruthy();
});

test("draws the growth from the oldest import to the newest, accumulated", async () => {
  stubDashboard();

  renderApp("/dashboard");

  const growth = (await screen.findByText("Growth by import")).nextElementSibling as HTMLElement;
  const labels = (await within(growth).findAllByRole("listitem")).map((item) => item.textContent);
  expect(labels[0]).toContain("OLDER");
  expect(labels[0]).toContain("100");
  expect(labels[1]).toContain("NEWER");
  expect(labels[1]).toContain("118");
});

test("lists the most connected entities, each linking to its page", async () => {
  stubDashboard();

  renderApp("/dashboard");

  const link = (await screen.findByText("10.0.0.1")).closest("a");
  expect(link?.getAttribute("href")).toBe("/entity?type=IP_ADDRESS&value=10.0.0.1");
  expect(screen.getByText("283")).toBeTruthy();
});

test("says so when nothing was imported", async () => {
  stubDashboard({
    "/imports": ok({ runs: [] }),
    "/graph/most-connected?limit=10": ok({ entities: [] }),
  });

  renderApp("/dashboard");

  expect(await screen.findByText("Nothing has been imported yet.")).toBeTruthy();
  expect(await screen.findByText("No entity has a relation yet.")).toBeTruthy();
});

test("a block that fails says so and does not hide the others", async () => {
  stubDashboard({ "/graph/most-connected?limit=10": failure(500, "storage is down") });

  renderApp("/dashboard");

  expect(await screen.findByText(/storage is down/)).toBeTruthy();
  expect(await screen.findByText("TYPE_0")).toBeTruthy();
});

test("is one of the sections of the page frame", async () => {
  stubDashboard();

  renderApp("/dashboard");

  expect(await screen.findByRole("link", { name: "Dashboard" })).toBeTruthy();
});
