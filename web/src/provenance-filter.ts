import type { EntityFindings, Provenance } from "./api/types.ts";

// A filter on where the findings of an entity came from, applied in the browser to what the entity page already
// loaded. A finding passes when it meets EVERY part that is set; a part that is not set lets everything through.
// `minConfidence` needs a confidence on the finding: one without confidence does not pass a filter that asks for one.
export interface ProvenanceFilter {
  tool?: string;
  module?: string;
  run?: string;
  minConfidence?: number;
}

export const NO_FILTER: ProvenanceFilter = {};

export function isFiltering(filter: ProvenanceFilter): boolean {
  return Object.values(filter).some((part) => part !== undefined);
}

export function matchesFilter(provenance: Provenance, filter: ProvenanceFilter): boolean {
  return (
    (filter.tool === undefined || provenance.tool === filter.tool) &&
    (filter.module === undefined || provenance.module === filter.module) &&
    (filter.run === undefined || provenance.run === filter.run) &&
    (filter.minConfidence === undefined ||
      (provenance.confidence !== undefined && provenance.confidence >= filter.minConfidence))
  );
}

// What the filter can choose from: the distinct tools, modules and runs of every relation and attribute, sorted,
// and whether any finding has a confidence (without one the confidence part would never match anything).
export interface FilterChoices {
  tools: string[];
  modules: string[];
  runs: string[];
  hasConfidence: boolean;
}

export function choicesOf(findings: EntityFindings): FilterChoices {
  const provenances = [...findings.relations, ...findings.attributes].map(
    ({ provenance }) => provenance,
  );
  const distinct = (pick: (provenance: Provenance) => string | undefined) =>
    [...new Set(provenances.map(pick).filter((part): part is string => part !== undefined))].sort();

  return {
    tools: distinct(({ tool }) => tool),
    modules: distinct(({ module }) => module),
    runs: distinct(({ run }) => run),
    hasConfidence: provenances.some(({ confidence }) => confidence !== undefined),
  };
}

export function applyFilter(findings: EntityFindings, filter: ProvenanceFilter): EntityFindings {
  return {
    ...findings,
    relations: findings.relations.filter(({ provenance }) => matchesFilter(provenance, filter)),
    attributes: findings.attributes.filter(({ provenance }) => matchesFilter(provenance, filter)),
  };
}
