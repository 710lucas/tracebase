import { expect, test } from "vitest";
import type { EntityFindings, Provenance } from "./api/types.ts";
import {
  applyFilter,
  choicesOf,
  isFiltering,
  matchesFilter,
  NO_FILTER,
} from "./provenance-filter.ts";

const entity = { type: "IP_ADDRESS", value: "10.0.0.1" };
const other = { type: "DOMAIN_NAME", value: "a.example.com" };

const provenance = (overrides: Partial<Provenance> = {}): Provenance => ({
  tool: "spiderfoot",
  run: "scan-1",
  ...overrides,
});

const findings: EntityFindings = {
  entity,
  relations: [
    {
      source: other,
      target: entity,
      provenance: provenance({ module: "sfp_dns", confidence: 100 }),
    },
    { source: entity, target: other, provenance: provenance({ run: "scan-2", confidence: 50 }) },
  ],
  attributes: [
    {
      name: "BANNER",
      values: ["nginx"],
      provenance: provenance({ tool: "nmap", module: "sfp_web" }),
    },
  ],
};

test("no filter lets everything through", () => {
  expect(isFiltering(NO_FILTER)).toBe(false);
  expect(applyFilter(findings, NO_FILTER)).toEqual(findings);
});

test("a filter is on when any part is set", () => {
  expect(isFiltering({ tool: "nmap" })).toBe(true);
  expect(isFiltering({ minConfidence: 0 })).toBe(true);
});

test("a finding must meet every part that is set", () => {
  const fromDns = provenance({ module: "sfp_dns", confidence: 90 });

  expect(matchesFilter(fromDns, { tool: "spiderfoot", module: "sfp_dns" })).toBe(true);
  expect(matchesFilter(fromDns, { tool: "spiderfoot", module: "sfp_other" })).toBe(false);
  expect(matchesFilter(fromDns, { run: "scan-9" })).toBe(false);
});

test("the minimum confidence keeps findings at or above it and drops the ones with none", () => {
  expect(matchesFilter(provenance({ confidence: 90 }), { minConfidence: 90 })).toBe(true);
  expect(matchesFilter(provenance({ confidence: 89 }), { minConfidence: 90 })).toBe(false);
  expect(matchesFilter(provenance(), { minConfidence: 1 })).toBe(false);
});

test("the choices are the distinct tools, modules and runs, sorted", () => {
  expect(choicesOf(findings)).toEqual({
    tools: ["nmap", "spiderfoot"],
    modules: ["sfp_dns", "sfp_web"],
    runs: ["scan-1", "scan-2"],
    hasConfidence: true,
  });
});

test("without any confidence the choices say so", () => {
  const plain: EntityFindings = { entity, relations: [], attributes: findings.attributes };

  expect(choicesOf(plain).hasConfidence).toBe(false);
  expect(choicesOf({ entity, relations: [], attributes: [] })).toEqual({
    tools: [],
    modules: [],
    runs: [],
    hasConfidence: false,
  });
});

test("filters both relations and attributes", () => {
  const filtered = applyFilter(findings, { tool: "spiderfoot", run: "scan-1" });

  expect(filtered.relations).toHaveLength(1);
  expect(filtered.attributes).toHaveLength(0);
  expect(filtered.entity).toBe(entity);
});
