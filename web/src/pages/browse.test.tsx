import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ok, stubApi } from "../test/stub-api.ts";
import { renderApp } from "../test/render-app.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("lists the entity types with their counts, each one a link to its list", async () => {
  stubApi({
    "/graph/types": ok({
      types: [
        { type: "INTERNET_NAME", count: 1200 },
        { type: "IP_ADDRESS", count: 40 },
      ],
    }),
  });

  renderApp("/browse");

  const link = await screen.findByText("INTERNET_NAME");
  expect(link.getAttribute("href")).toBe("/browse/INTERNET_NAME");
  expect(screen.getByText((1200).toLocaleString())).toBeTruthy();
});

test("shows a page of entities with its range and the way to the next page", async () => {
  const { calls } = stubApi({
    "/graph/types/IP_ADDRESS/entities?limit=50&offset=0": ok({
      total: 120,
      entities: [
        { type: "IP_ADDRESS", value: "1.1.1.1" },
        { type: "IP_ADDRESS", value: "8.8.8.8" },
      ],
    }),
    "/graph/types/IP_ADDRESS/entities?limit=50&offset=50": ok({ total: 120, entities: [] }),
  });

  renderApp("/browse/IP_ADDRESS");

  expect(await screen.findByText("1.1.1.1")).toBeTruthy();
  expect(screen.getByText("1–2 of 120")).toBeTruthy();
  expect((screen.getByText("Previous") as HTMLButtonElement).disabled).toBe(true);

  fireEvent.click(screen.getByText("Next"));

  await waitFor(() =>
    expect(calls.at(-1)).toBe("/graph/types/IP_ADDRESS/entities?limit=50&offset=50"),
  );
});

test("searches the values and starts again from the first page", async () => {
  const { calls } = stubApi({
    "/graph/types/IP_ADDRESS/entities?limit=50&offset=0": ok({
      total: 1,
      entities: [{ type: "IP_ADDRESS", value: "1.1.1.1" }],
    }),
    "/graph/types/IP_ADDRESS/entities?limit=50&offset=0&search=8.8": ok({
      total: 1,
      entities: [{ type: "IP_ADDRESS", value: "8.8.8.8" }],
    }),
  });

  renderApp("/browse/IP_ADDRESS");
  await screen.findByText("1.1.1.1");

  fireEvent.change(screen.getByLabelText("Search in the values"), { target: { value: "8.8" } });
  fireEvent.click(screen.getByText("Search"));

  expect(await screen.findByText("8.8.8.8")).toBeTruthy();
  expect(calls.at(-1)).toBe("/graph/types/IP_ADDRESS/entities?limit=50&offset=0&search=8.8");
});

test("says so when no entity matches", async () => {
  stubApi({ "/graph/types/NOPE/entities?limit=50&offset=0": ok({ total: 0, entities: [] }) });

  renderApp("/browse/NOPE");

  expect(await screen.findByText("No entity of this type matches.")).toBeTruthy();
});
