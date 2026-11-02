import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ok, stubApi } from "../test/stub-api.ts";
import { renderApp } from "../test/render-app.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("lists each run with what it brought", async () => {
  stubApi({
    "/imports": ok({
      runs: [
        {
          tool: "spiderfoot",
          run: "D0366C3F",
          relations: 15109,
          attributes: 4664,
          receivedAt: 1793411159382,
        },
        { tool: "spiderfoot", run: "273C9426", relations: 18, attributes: 0 },
      ],
    }),
  });

  renderApp("/imports");

  expect(await screen.findByText("D0366C3F")).toBeTruthy();
  expect(screen.getByText((15109).toLocaleString())).toBeTruthy();
  expect(screen.getByText("273C9426")).toBeTruthy();
  // The run with no date says so instead of showing an invalid one.
  expect(screen.getByText("unknown")).toBeTruthy();
});

test("says so when nothing was imported", async () => {
  stubApi({ "/imports": ok({ runs: [] }) });

  renderApp("/imports");

  expect(await screen.findByText("Nothing has been imported yet.")).toBeTruthy();
});
