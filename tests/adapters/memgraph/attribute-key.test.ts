import { test } from "node:test";
import assert from "node:assert/strict";
import { attributeKey } from "../../../src/adapters/memgraph/attribute-key.ts";
import { createAttribute } from "../../../src/core/domain/attribute/index.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";
import { createProvenance, type ProvenanceDTO } from "../../../src/core/domain/provenance/index.ts";

interface Overrides {
  entityValue?: string;
  name?: string;
  value?: string;
  provenance?: Partial<ProvenanceDTO>;
}

function attributeWith(overrides: Overrides = {}) {
  return createAttribute({
    entity: createEntity("IP_ADDRESS", overrides.entityValue ?? "93.184.216.34"),
    name: overrides.name ?? "WEBSERVER_BANNER",
    value: overrides.value ?? "nginx",
    provenance: createProvenance({
      tool: "spiderfoot",
      run: "scan-1",
      module: "sfp_portscan_tcp",
      ...overrides.provenance,
    }),
  });
}

test("the key is a 64 character hexadecimal hash", () => {
  assert.match(attributeKey(attributeWith()), /^[0-9a-f]{64}$/);
});

test("the same attribute has the same key", () => {
  assert.equal(attributeKey(attributeWith()), attributeKey(attributeWith()));
});

const FIELDS_THAT_MAKE_A_DIFFERENT_ATTRIBUTE: [string, Overrides][] = [
  ["tool", { provenance: { tool: "other-tool" } }],
  ["run", { provenance: { run: "scan-2" } }],
  ["module", { provenance: { module: "sfp_other" } }],
  ["entity", { entityValue: "10.0.0.1" }],
  ["name", { name: "OS" }],
  ["value", { value: "apache" }],
];

for (const [field, overrides] of FIELDS_THAT_MAKE_A_DIFFERENT_ATTRIBUTE) {
  test(`a different ${field} gives a different key`, () => {
    assert.notEqual(attributeKey(attributeWith(overrides)), attributeKey(attributeWith()));
  });
}

test("fields that only describe the finding do not change the key", () => {
  const described = attributeWith({
    provenance: { confidence: 50, observedAt: 1000, recordedAt: 2000, recordRef: "hash-1" },
  });

  assert.equal(attributeKey(described), attributeKey(attributeWith()));
});
