import { cleanup, screen, within } from "@testing-library/react";
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

  expect(await screen.findByText("sfp_cinsscore")).toBeTruthy();
  expect(screen.getByText("sfp_blocklistde")).toBeTruthy();
});
