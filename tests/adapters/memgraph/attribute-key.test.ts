import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { attributeKey } from "../../../src/adapters/memgraph/attribute-key.ts";
import { createAttribute } from "../../../src/core/domain/attribute/index.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";
import { createProvenance, type ProvenanceDTO } from "../../../src/core/domain/provenance/index.ts";

interface Overrides {
  entityValue?: string;
  name?: string;
  qualifier?: string;
  values?: string[];
  provenance?: Partial<ProvenanceDTO>;
}

function attributeWith(overrides: Overrides = {}) {
  return createAttribute({
    entity: createEntity("IP_ADDRESS", overrides.entityValue ?? "93.184.216.34"),
    name: overrides.name ?? "WEBSERVER_BANNER",
    ...(overrides.qualifier !== undefined && { qualifier: overrides.qualifier }),
    values: overrides.values ?? ["nginx"],
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
  ["values", { values: ["apache"] }],
  ["number of values", { values: ["nginx", "apache"] }],
  ["qualifier", { qualifier: "sfp_webserver" }],
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

test("the key does not depend on the order the values were listed in, or on repeats", () => {
  const ordered = attributeWith({ values: ["a", "b", "c"] });
  const shuffled = attributeWith({ values: ["c", "a", "b", "a"] });

  assert.equal(attributeKey(ordered), attributeKey(shuffled));
});

test("two different qualifiers give different keys", () => {
  assert.notEqual(
    attributeKey(attributeWith({ qualifier: "sfp_a" })),
    attributeKey(attributeWith({ qualifier: "sfp_b" })),
  );
});

// Keys stored before the qualifier existed must still match, so without a qualifier the hashed list is
// exactly the one it was.
test("an attribute without a qualifier keeps the key it had before the qualifier existed", () => {
  const withoutQualifier = JSON.stringify([
    "spiderfoot",
    "scan-1",
    "sfp_portscan_tcp",
    "IP_ADDRESS",
    "93.184.216.34",
    "WEBSERVER_BANNER",
    ["nginx"],
  ]);

  assert.equal(
    attributeKey(attributeWith()),
    createHash("sha256").update(withoutQualifier).digest("hex"),
  );
});
