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
    onlyTypes: ReadonlySet<string>;
    layout: string;
    spacing: string;
    onSelect: (node: { type: string; value: string; distance: number } | null) => void;
  }) => (
    <div>
      <ul>
        {props.elements.nodes.map(({ data }) => (
          <li key={data.value}>{`node ${data.value}`}</li>
        ))}
      </ul>
      <span>{`edges ${props.elements.edges.length}`}</span>
      <span>{`only ${[...props.onlyTypes].sort().join(",")}`}</span>
      <span>{`layout ${props.layout} ${props.spacing}`}</span>
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

test("lists the types that are drawn, each with how many entities it has", async () => {
  stubApi({ [URL_2_200]: ok(neighbourhood) });

  renderApp(ADDRESS);

  const legend = (await screen.findByText("Types")).nextElementSibling
    ?.nextElementSibling as HTMLElement;
  const items = within(legend)
    .getAllByRole("button")
    .map((button) => button.textContent?.replace(/\s+/g, " ").trim());
  expect(items).toEqual(["DOMAIN_NAME 1", "IP_ADDRESS 1"]);
});

test("clicking a type in the side panel keeps only the types chosen, and clicking it again lets it go", async () => {
  stubApi({ [URL_2_200]: ok(neighbourhood) });

  renderApp(ADDRESS);
  await screen.findByText("node 10.0.0.1");
  expect(screen.getByText("only")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /DOMAIN_NAME/ }));
  expect(screen.getByText("only DOMAIN_NAME")).toBeTruthy();
  expect(screen.getByText(/Showing 2 of 2 entities/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /IP_ADDRESS/ }));
  expect(screen.getByText("only DOMAIN_NAME,IP_ADDRESS")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /DOMAIN_NAME/ }));
  expect(screen.getByText("only IP_ADDRESS")).toBeTruthy();
});

test("the filter counts the entities it shows, the origin always among them", async () => {
  stubApi({
    [URL_2_200]: ok({
      ...neighbourhood,
      entities: [
        { type: "DOMAIN_NAME", value: "a.example.com", distance: 1 },
        { type: "DOMAIN_NAME", value: "b.example.com", distance: 1 },
        { type: "ASN", value: "AS1", distance: 2 },
      ],
    }),
  });

  renderApp(ADDRESS);
  await screen.findByText("node 10.0.0.1");
  fireEvent.click(screen.getByRole("button", { name: /ASN/ }));

  // The origin and the one ASN, of the four entities.
  expect(screen.getByText(/Showing 2 of 4 entities/)).toBeTruthy();
});

test("Show all types undoes the filter", async () => {
  stubApi({ [URL_2_200]: ok(neighbourhood) });

  renderApp(ADDRESS);
  await screen.findByText("node 10.0.0.1");
  expect(screen.queryByRole("button", { name: "Show all types" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /DOMAIN_NAME/ }));
  fireEvent.click(screen.getByRole("button", { name: "Show all types" }));

  expect(screen.getByText("only")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Show all types" })).toBeNull();
});

test("draws grouped by type with normal spacing at first, and the selectors change it", async () => {
  stubApi({ [URL_2_200]: ok(neighbourhood) });

  renderApp(ADDRESS);
  expect(await screen.findByText("layout grouped normal")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Layout"), { target: { value: "rings" } });
  fireEvent.change(screen.getByLabelText("Spacing"), { target: { value: "wide" } });

  expect(screen.getByText("layout rings wide")).toBeTruthy();
});

test("the layout stays when the neighbourhood is asked again", async () => {
  const more =
    "/graph/entities/neighbourhood?type=IP_ADDRESS&value=10.0.0.1&hops=4&maxEntities=200";
  stubApi({ [URL_2_200]: ok(neighbourhood), [more]: ok(neighbourhood) });

  renderApp(ADDRESS);
  await screen.findByText("layout grouped normal");
  fireEvent.change(screen.getByLabelText("Layout"), { target: { value: "force" } });
  fireEvent.change(screen.getByLabelText(/Relations away/), { target: { value: "4" } });

  expect(await screen.findByText("layout force normal")).toBeTruthy();
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

const EXPAND_URL =
  "/graph/entities/neighbourhood?type=DOMAIN_NAME&value=a.example.com&hops=1&maxEntities=200";
const asn = { type: "ASN", value: "AS1" };
const expansion = {
  origin: { type: "DOMAIN_NAME", value: "a.example.com" },
  hops: 1,
  maxEntities: 200,
  entities: [
    { type: "IP_ADDRESS", value: "10.0.0.1", distance: 1 },
    { ...asn, distance: 1 },
  ],
  relations: [
    {
      source: { type: "DOMAIN_NAME", value: "a.example.com" },
      target: asn,
    },
  ],
  truncated: false,
};

test("expanding the selected node draws its relations on top of what is there", async () => {
  const { calls } = stubApi({ [URL_2_200]: ok(neighbourhood), [EXPAND_URL]: ok(expansion) });

  renderApp(ADDRESS);
  await screen.findByText("node 10.0.0.1");
  fireEvent.click(screen.getByText("click a node"));
  fireEvent.click(await screen.findByRole("button", { name: "Expand" }));

  expect(await screen.findByText("node AS1")).toBeTruthy();
  // The two nodes that were there stay, the only new one is the ASN, and the new link is one more edge.
  expect(screen.getAllByText(/^node /)).toHaveLength(3);
  expect(screen.getByText("edges 2")).toBeTruthy();
  expect(screen.getByText("1 new entity.")).toBeTruthy();
  expect(calls).toEqual([URL_2_200, EXPAND_URL]);
});

test("an expansion that finds nothing new says so", async () => {
  stubApi({
    [URL_2_200]: ok(neighbourhood),
    [EXPAND_URL]: ok({ ...expansion, entities: [], relations: [] }),
  });

  renderApp(ADDRESS);
  await screen.findByText("node 10.0.0.1");
  fireEvent.click(screen.getByText("click a node"));
  fireEvent.click(await screen.findByRole("button", { name: "Expand" }));

  expect(await screen.findByText("No new entity.")).toBeTruthy();
});

test("an expansion that is cut says how to see more", async () => {
  stubApi({ [URL_2_200]: ok(neighbourhood), [EXPAND_URL]: ok({ ...expansion, truncated: true }) });

  renderApp(ADDRESS);
  await screen.findByText("node 10.0.0.1");
  fireEvent.click(screen.getByText("click a node"));
  fireEvent.click(await screen.findByRole("button", { name: "Expand" }));

  expect(await screen.findByText(/More exist/)).toBeTruthy();
});

test("an expansion that fails shows the error and keeps the drawing", async () => {
  stubApi({ [URL_2_200]: ok(neighbourhood), [EXPAND_URL]: failure(504, "Query exceeded 30 s") });

  renderApp(ADDRESS);
  await screen.findByText("node 10.0.0.1");
  fireEvent.click(screen.getByText("click a node"));
  fireEvent.click(await screen.findByRole("button", { name: "Expand" }));

  expect(await screen.findByText(/Could not expand: Query exceeded 30 s/)).toBeTruthy();
  expect(screen.getByText("node a.example.com")).toBeTruthy();
});

test("a new hops choice starts again from the neighbourhood of the address", async () => {
  const more =
    "/graph/entities/neighbourhood?type=IP_ADDRESS&value=10.0.0.1&hops=3&maxEntities=200";
  stubApi({
    [URL_2_200]: ok(neighbourhood),
    [EXPAND_URL]: ok(expansion),
    [more]: ok(neighbourhood),
  });

  renderApp(ADDRESS);
  await screen.findByText("node 10.0.0.1");
  fireEvent.click(screen.getByText("click a node"));
  fireEvent.click(await screen.findByRole("button", { name: "Expand" }));
  await screen.findByText("node AS1");
  fireEvent.change(screen.getByLabelText(/Relations away/), { target: { value: "3" } });

  await vi.waitFor(() => expect(screen.queryByText("node AS1")).toBeNull());
});
