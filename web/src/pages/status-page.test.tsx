import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ok, stubApi } from "../test/stub-api.ts";
import { renderApp } from "../test/render-app.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("shows the storage, the address without credentials and the size of the graph", async () => {
  stubApi({
    "/status": ok({
      storage: "memgraph",
      memgraphUrl: "bolt://localhost:7687",
      reachable: true,
      totals: { entities: 5233, relations: 16311, attributes: 4990 },
    }),
  });

  renderApp("/");

  expect(await screen.findByText("Memgraph")).toBeTruthy();
  expect(screen.getByText("bolt://localhost:7687")).toBeTruthy();
  expect(screen.getByText("Answering")).toBeTruthy();
  expect(screen.getByText((5233).toLocaleString())).toBeTruthy();
});

test("says so when the storage does not answer", async () => {
  stubApi({
    "/status": ok({
      storage: "memgraph",
      memgraphUrl: "bolt://localhost:7687",
      reachable: false,
      error: "connection lost",
    }),
  });

  renderApp("/");

  expect(await screen.findByText("Not answering: connection lost")).toBeTruthy();
});

test("asks again when the button is pressed", async () => {
  const { calls } = stubApi({
    "/status": ok({
      storage: "memory",
      reachable: true,
      totals: { entities: 0, relations: 0, attributes: 0 },
    }),
  });

  renderApp("/");
  await screen.findByText("In memory (lost on restart)");
  fireEvent.click(screen.getByText("Check again"));

  await waitFor(() => expect(calls).toEqual(["/status", "/status"]));
});

test("shows the API's failure instead of an empty screen", async () => {
  stubApi({});

  renderApp("/");

  expect((await screen.findByRole("alert")).textContent).toContain("no stub for /status");
});
