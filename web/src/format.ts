import type { Provenance } from "./api/types.ts";

// The screens show dates in the viewer's own locale and time zone. The API sends epoch milliseconds.
export function formatDate(milliseconds: number | undefined): string {
  if (milliseconds === undefined) return "unknown";

  return new Date(milliseconds).toLocaleString();
}

export function formatNumber(value: number): string {
  return value.toLocaleString();
}

// When a finding happened: the tool's own date if it sent one, otherwise when we received it.
export function seenAt(provenance: Provenance): number | undefined {
  return provenance.observedAt ?? provenance.recordedAt;
}

// Where a finding came from, on one line: "spiderfoot · run D0366C3F · sfp_dnsresolve".
export function describeProvenance(provenance: Provenance): string {
  return [provenance.tool, `run ${provenance.run}`, provenance.module]
    .filter((part) => part !== undefined)
    .join(" · ");
}
