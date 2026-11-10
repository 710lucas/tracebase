import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ok, stubApi } from "../test/stub-api.ts";
import { renderApp } from "../test/render-app.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const address = { type: "IP_ADDRESS", value: "93.184.216.34" };
const domain = { type: "DOMAIN_NAME", value: "example.com" };
const provenance = {
  tool: "spiderfoot",
  run: "scan-1",
  module: "sfp_dnsresolve",
  recordedAt: 1000,
};

const findings = {
  entity: address,
  relations: [
    { source: domain, target: address, type: "resolves_to", provenance },
    { source: address, target: { type: "ASN", value: "AS15133" }, provenance },
  ],
  attributes: [
    {
      entity: address,
      name: "banner",
      values: ["nginx"],
      provenance: { ...provenance, recordedAt: 1000 },
    },
    {
      entity: address,
      name: "banner",
      values: ["apache"],
      provenance: { ...provenance, recordedAt: 2000 },
    },
    { entity: address, name: "asn", values: ["AS15133"], provenance },
  ],
};

test("shows the relations as seen from the entity and links to the other end", async () => {
  stubApi({ "/graph/entities?type=IP_ADDRESS&value=93.184.216.34": ok(findings) });

  renderApp("/entity?type=IP_ADDRESS&value=93.184.216.34");

  expect(await screen.findByText("Relations (2)")).toBeTruthy();
  // The domain points here (←) and the entity points to the ASN (→).
  expect(screen.getByText("←")).toBeTruthy();
  expect(screen.getByText("→")).toBeTruthy();
  expect(screen.getByText("example.com").closest("a")?.getAttribute("href")).toBe(
    "/entity?type=DOMAIN_NAME&value=example.com",
  );
  expect(screen.getByText("unnamed")).toBeTruthy();
});

test("links to the neighbourhood of the entity drawn as a graph", async () => {
  stubApi({ "/graph/entities?type=IP_ADDRESS&value=93.184.216.34": ok(findings) });

  renderApp("/entity?type=IP_ADDRESS&value=93.184.216.34");

  const link = await screen.findByRole("link", { name: "View as a graph" });
  expect(link.getAttribute("href")).toBe("/graph?type=IP_ADDRESS&value=93.184.216.34");
});

test("lists the attributes by name, the newest value first", async () => {
  stubApi({ "/graph/entities?type=IP_ADDRESS&value=93.184.216.34": ok(findings) });

  renderApp("/entity?type=IP_ADDRESS&value=93.184.216.34");

  await screen.findByText("Attributes (3)");
  // The second table is the attributes; the first row is the header.
  const [, attributesTable] = screen.getAllByRole("table");
  const rows = within(attributesTable as HTMLElement)
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent ?? "");

  expect(rows[0]).toContain("asn");
  expect(rows[1]).toContain("apache");
  expect(rows[2]).toContain("nginx");
});

test("says so when nothing in the graph mentions the entity", async () => {
  stubApi({});

  renderApp("/entity?type=IP_ADDRESS&value=10.0.0.99");

  expect(await screen.findByText("Nothing in the graph mentions this entity.")).toBeTruthy();
});

test("sends a value with line breaks and a URL whole", async () => {
  const value = "Docker Hub (User)\nhttps://hub.docker.com/u/710lucas";
  const query = new URLSearchParams({ type: "ACCOUNT", value });
  const { calls } = stubApi({
    [`/graph/entities?${query}`]: ok({
      entity: { type: "ACCOUNT", value },
      relations: [],
      attributes: [],
    }),
  });

  renderApp(`/entity?${query}`);

  expect(await screen.findByText("Relations (0)")).toBeTruthy();
  expect(calls).toHaveLength(1);
});

test("an unknown address shows the not found page", async () => {
  renderApp("/nowhere");

  expect(await screen.findByText("Page not found")).toBeTruthy();
});

test("shows every value of one observation together in the same row", async () => {
  const headers = {
    entity: address,
    name: "WEBSERVER_STRANGEHEADER",
    values: ["x-cache: Miss", "x-runtime: 0.2"],
    provenance,
  };
  stubApi({
    "/graph/entities?type=IP_ADDRESS&value=93.184.216.34": ok({
      entity: address,
      relations: [],
      attributes: [headers],
    }),
  });

  renderApp("/entity?type=IP_ADDRESS&value=93.184.216.34");

  expect(await screen.findByText("Attributes (1)")).toBeTruthy();
  const row = screen.getByText("x-cache: Miss").closest("tr");
  expect(row?.textContent).toContain("x-runtime: 0.2");
});

test("shows the qualifier under the attribute name", async () => {
  stubApi({
    "/graph/entities?type=IP_ADDRESS&value=93.184.216.34": ok({
      entity: address,
      relations: [],
      attributes: [
        { name: "list", qualifier: "sfp_cinsscore", values: ["a"], provenance },
        { name: "list", qualifier: "sfp_blocklistde", values: ["b"], provenance },
      ],
    }),
  });

  renderApp("/entity?type=IP_ADDRESS&value=93.184.216.34");

  // The attributes table is the first one under the "Attributes" heading; the timeline repeats the qualifiers.
  const table = (await screen.findByText("Attributes (2)")).nextElementSibling as HTMLElement;
  expect(within(table).getByText("sfp_cinsscore")).toBeTruthy();
  expect(within(table).getByText("sfp_blocklistde")).toBeTruthy();
});

const twoRuns = {
  entity: address,
  relations: [
    {
      source: domain,
      target: address,
      provenance: { tool: "spiderfoot", run: "scan-1", module: "sfp_dns", confidence: 100 },
    },
    {
      source: address,
      target: { type: "ASN", value: "AS15133" },
      provenance: { tool: "spiderfoot", run: "scan-2", module: "sfp_asn", confidence: 40 },
    },
  ],
  attributes: [
    {
      entity: address,
      name: "banner",
      values: ["nginx"],
      provenance: { tool: "spiderfoot", run: "scan-1", module: "sfp_web", observedAt: 1000 },
    },
    {
      entity: address,
      name: "banner",
      values: ["apache", "php"],
      provenance: { tool: "spiderfoot", run: "scan-2", module: "sfp_web", observedAt: 2000 },
    },
  ],
};

const ENTITY_URL = "/graph/entities?type=IP_ADDRESS&value=93.184.216.34";

function relationsTable() {
  return screen.getAllByRole("table")[0] as HTMLElement;
}

test("filters the relations and attributes by run and says how many are left", async () => {
  stubApi({ [ENTITY_URL]: ok(twoRuns) });

  renderApp("/entity?type=IP_ADDRESS&value=93.184.216.34");
  await screen.findByText("Relations (2)");
  fireEvent.change(screen.getByLabelText("Run"), { target: { value: "scan-1" } });

  expect(screen.getByText("Relations (1 of 2)")).toBeTruthy();
  expect(screen.getByText("Attributes (1 of 2)")).toBeTruthy();
  expect(within(relationsTable()).queryByText("AS15133")).toBeNull();
  expect(within(relationsTable()).getByText("example.com")).toBeTruthy();
});

test("filters by the minimum confidence, which only appears when a finding has one", async () => {
  stubApi({ [ENTITY_URL]: ok(twoRuns) });

  renderApp("/entity?type=IP_ADDRESS&value=93.184.216.34");
  await screen.findByText("Relations (2)");
  fireEvent.change(screen.getByLabelText(/Confidence at least/), { target: { value: "50" } });

  expect(screen.getByText("Relations (1 of 2)")).toBeTruthy();
  // The attributes have no confidence, so a filter that asks for one hides them all.
  expect(screen.getByText("Attributes (0 of 2)")).toBeTruthy();
});

test("Clear filter brings everything back and goes away", async () => {
  stubApi({ [ENTITY_URL]: ok(twoRuns) });

  renderApp("/entity?type=IP_ADDRESS&value=93.184.216.34");
  await screen.findByText("Relations (2)");
  expect(screen.queryByRole("button", { name: "Clear filter" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Run"), { target: { value: "scan-2" } });
  fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));

  expect(screen.getByText("Relations (2)")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Clear filter" })).toBeNull();
});

test("a filter part with nothing to choose between is not shown", async () => {
  stubApi({ [ENTITY_URL]: ok(twoRuns) });

  renderApp("/entity?type=IP_ADDRESS&value=93.184.216.34");
  await screen.findByText("Relations (2)");

  // One tool in all the findings: no selector for it. Two runs and three modules: selectors.
  expect(screen.queryByLabelText("Tool")).toBeNull();
  expect(screen.getByLabelText("Run")).toBeTruthy();
  expect(screen.getByLabelText("Module")).toBeTruthy();
});

test("marks the newest set of an attribute as current and the others as replaced, with how many values", async () => {
  stubApi({ [ENTITY_URL]: ok(twoRuns) });

  renderApp("/entity?type=IP_ADDRESS&value=93.184.216.34");
  await screen.findByText("Attributes (2)");

  const rows = within(screen.getAllByRole("table")[1] as HTMLElement)
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent ?? "");
  expect(rows[0]).toContain("apache");
  expect(rows[0]).toContain("2 values, found together");
  expect(rows[0]).toContain("current");
  expect(rows[1]).toContain("nginx");
  expect(rows[1]).toContain("replaced");
});

test("the current set is the newest of all, even when the filter hides it", async () => {
  stubApi({ [ENTITY_URL]: ok(twoRuns) });

  renderApp("/entity?type=IP_ADDRESS&value=93.184.216.34");
  await screen.findByText("Attributes (2)");
  fireEvent.change(screen.getByLabelText("Run"), { target: { value: "scan-1" } });

  const row = within(screen.getAllByRole("table")[1] as HTMLElement).getAllByRole("row")[1];
  expect(row?.textContent).toContain("nginx");
  expect(row?.textContent).toContain("replaced");
});

test("shows the timeline: the runs that found something and how an attribute changed", async () => {
  stubApi({ [ENTITY_URL]: ok(twoRuns) });

  renderApp("/entity?type=IP_ADDRESS&value=93.184.216.34");

  await screen.findByText("Timeline");
  expect(screen.getByText("Seen by")).toBeTruthy();
  expect(screen.getByText("first reported")).toBeTruthy();
  // The second set added apache and php and removed nginx.
  expect(screen.getByText("+ apache")).toBeTruthy();
  expect(screen.getByText("+ php")).toBeTruthy();
  expect(screen.getByText("− nginx")).toBeTruthy();
});

test("the timeline says so when the entity has no attribute", async () => {
  stubApi({ [ENTITY_URL]: ok({ ...twoRuns, attributes: [] }) });

  renderApp("/entity?type=IP_ADDRESS&value=93.184.216.34");

  await screen.findByText("Timeline");
  expect(screen.getAllByText("No attributes.").length).toBeGreaterThanOrEqual(1);
});
