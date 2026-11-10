import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { failure, ok, stubApi } from "../test/stub-api.ts";
import { renderApp } from "../test/render-app.tsx";

// Cytoscape draws on a canvas, which the test environment does not have, so the drawing is replaced by a list of
// what it was given and a button that clicks a node. What is tested is what the page asks for, gives to the drawing
// and does with a click; the drawing itself is checked in a browser.
vi.mock("../components/graph-canvas.tsx", () => ({
  GraphCanvas: (props: {
    elements: { nodes: { data: { value: string } }[]; edges: unknown[] };
    originId: string;
    onSelect: (node: { type: string; value: string; distance: number } | null) => void;
  }) => (
    <div>
      <ul>
        {props.elements.nodes.map(({ data }) => (
          <li key={data.value}>{`node ${data.value}`}</li>
        ))}
      </ul>
      <span>{`edges ${props.elements.edges.length}`}</span>
      <button
        onClick={() => props.onSelect({ type: "DOMAIN_NAME", value: "a.example.com", distance: 1 })}
      >
        click a node
      </button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const URL_2_200 =
  "/graph/entities/neighbourhood?type=IP_ADDRESS&value=10.0.0.1&hops=2&maxEntities=200";

const neighbourhood = {
  origin: { type: "IP_ADDRESS", value: "10.0.0.1" },
  hops: 2,
  maxEntities: 200,
  entities: [{ type: "DOMAIN_NAME", value: "a.example.com", distance: 1 }],
  relations: [
    {
      source: { type: "DOMAIN_NAME", value: "a.example.com" },
      target: { type: "IP_ADDRESS", value: "10.0.0.1" },
    },
  ],
  truncated: false,
};

const ADDRESS = "/graph?type=IP_ADDRESS&value=10.0.0.1";

test("draws the neighbourhood the API answers, with the default hops and maximum", async () => {
  const { calls } = stubApi({ [URL_2_200]: ok(neighbourhood) });

  renderApp(ADDRESS);

  expect(await screen.findByText("node 10.0.0.1")).toBeTruthy();
  expect(screen.getByText("node a.example.com")).toBeTruthy();
  expect(screen.getByText("edges 1")).toBeTruthy();
  expect(screen.getByText(/2 entities and 1 links/)).toBeTruthy();
  expect(calls).toEqual([URL_2_200]);
});

test("uses the hops and the maximum of the address", async () => {
  const url = "/graph/entities/neighbourhood?type=IP_ADDRESS&value=10.0.0.1&hops=3&maxEntities=50";
  const { calls } = stubApi({ [url]: ok(neighbourhood) });

  renderApp(`${ADDRESS}&hops=3&maxEntities=50`);

  await screen.findByText("node 10.0.0.1");
  expect(calls).toEqual([url]);
});

test("falls back to the defaults for numbers that make no sense", async () => {
  const { calls } = stubApi({ [URL_2_200]: ok(neighbourhood) });

  renderApp(`${ADDRESS}&hops=abc&maxEntities=0`);

  await screen.findByText("node 10.0.0.1");
  expect(calls).toEqual([URL_2_200]);
});

test("asks again when the hops change", async () => {
  const more =
    "/graph/entities/neighbourhood?type=IP_ADDRESS&value=10.0.0.1&hops=4&maxEntities=200";
  const { calls } = stubApi({ [URL_2_200]: ok(neighbourhood), [more]: ok(neighbourhood) });

  renderApp(ADDRESS);
  await screen.findByText("node 10.0.0.1");
  fireEvent.change(screen.getByLabelText(/Relations away/), { target: { value: "4" } });

  await vi.waitFor(() => expect(calls).toEqual([URL_2_200, more]));
});

test("says when the neighbourhood is bigger than what is drawn", async () => {
  stubApi({ [URL_2_200]: ok({ ...neighbourhood, truncated: true }) });

  renderApp(ADDRESS);

  expect(await screen.findByText(/the neighbourhood is bigger/)).toBeTruthy();
});

test("a click on a node shows it, how far it is, and links to its page and its own graph", async () => {
  stubApi({ [URL_2_200]: ok(neighbourhood) });

  renderApp(ADDRESS);
  expect(await screen.findByText("Click an entity.")).toBeTruthy();
  fireEvent.click(screen.getByText("click a node"));

  expect(await screen.findByText("1 relation away")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Draw its neighbourhood" }).getAttribute("href")).toBe(
    "/graph?type=DOMAIN_NAME&value=a.example.com",
  );
  expect(screen.getByText("a.example.com").closest("a")?.getAttribute("href")).toBe(
    "/entity?type=DOMAIN_NAME&value=a.example.com",
  );
});

test("lists the types that are drawn", async () => {
  stubApi({ [URL_2_200]: ok(neighbourhood) });

  renderApp(ADDRESS);

  const legend = (await screen.findByText("Types")).nextElementSibling as HTMLElement;
  expect(within(legend).getByText("DOMAIN_NAME")).toBeTruthy();
  expect(within(legend).getByText("IP_ADDRESS")).toBeTruthy();
});

test("says so when nothing mentions the entity", async () => {
  stubApi({ [URL_2_200]: failure(404, "entity not found") });

  renderApp(ADDRESS);

  expect(await screen.findByText("Nothing in the graph mentions this entity.")).toBeTruthy();
});

test("shows the error when the API fails", async () => {
  stubApi({ [URL_2_200]: failure(504, "Query exceeded 30 s") });

  renderApp(ADDRESS);

  expect(await screen.findByText(/Query exceeded 30 s/)).toBeTruthy();
});
