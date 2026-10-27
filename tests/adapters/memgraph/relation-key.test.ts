import { test } from "node:test";
import assert from "node:assert/strict";
import { relationKey } from "../../../src/adapters/memgraph/relation-key.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";
import { createProvenance, type ProvenanceDTO } from "../../../src/core/domain/provenance/index.ts";
import { createRelation } from "../../../src/core/domain/relation/index.ts";

interface Overrides {
  provenance?: Partial<ProvenanceDTO>;
  sourceValue?: string;
  targetType?: string;
  type?: string;
}

function relationWith(overrides: Overrides = {}) {
  return createRelation({
    source: createEntity("DOMAIN_NAME", overrides.sourceValue ?? "example.com"),
    target: createEntity(overrides.targetType ?? "IP_ADDRESS", "93.184.216.34"),
    provenance: createProvenance({
      tool: "spiderfoot",
      run: "scan-1",
      module: "sfp_dnsresolve",
      ...overrides.provenance,
    }),
    ...(overrides.type !== undefined && { type: overrides.type }),
  });
}

test("the key is a 64 character hexadecimal hash", () => {
  assert.match(relationKey(relationWith()), /^[0-9a-f]{64}$/);
});

test("the same relation has the same key", () => {
  assert.equal(relationKey(relationWith()), relationKey(relationWith()));
});

const FIELDS_THAT_MAKE_A_DIFFERENT_RELATION: [string, Overrides][] = [
  ["tool", { provenance: { tool: "other-tool" } }],
  ["run", { provenance: { run: "scan-2" } }],
  ["module", { provenance: { module: "sfp_other" } }],
  ["source", { sourceValue: "other.org" }],
  ["target", { targetType: "IPV6_ADDRESS" }],
  ["relation type", { type: "resolves_to" }],
];

for (const [field, overrides] of FIELDS_THAT_MAKE_A_DIFFERENT_RELATION) {
  test(`a different ${field} gives a different key`, () => {
    assert.notEqual(relationKey(relationWith(overrides)), relationKey(relationWith()));
  });
}

test("fields that only describe the finding do not change the key", () => {
  const described = relationWith({
    provenance: { confidence: 50, observedAt: 1000, recordedAt: 2000, recordRef: "hash-1" },
  });

  assert.equal(relationKey(described), relationKey(relationWith()));
});

test("an absent module is not the same as an empty one", () => {
  const withoutModule = createRelation({
    source: createEntity("DOMAIN_NAME", "example.com"),
    target: createEntity("IP_ADDRESS", "93.184.216.34"),
    provenance: createProvenance({ tool: "spiderfoot", run: "scan-1" }),
  });

  assert.notEqual(
    relationKey(withoutModule),
    relationKey(relationWith({ provenance: { module: "" } })),
  );
});

test("moving a separator between two fields does not produce the same key", () => {
  const first = relationWith({ provenance: { tool: "a|b", run: "c" } });
  const second = relationWith({ provenance: { tool: "a", run: "b|c" } });

  assert.notEqual(relationKey(first), relationKey(second));
});
