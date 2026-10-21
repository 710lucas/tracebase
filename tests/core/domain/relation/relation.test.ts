import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntity } from "../../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../../src/core/domain/provenance/index.ts";
import type { Relation } from "../../../../src/core/domain/relation/index.ts";

// Mostly a compile-time guard: if the shape of `Relation` changes, `npm run typecheck`
// fails here. The runtime assertions show how the modules fit together.
test("a relation carries source, target and provenance", () => {
  const relation: Relation = {
    source: createEntity("DOMAIN_NAME", "example.com"),
    target: createEntity("IP_ADDRESS", "93.184.216.34"),
    provenance: createProvenance({
      tool: "spiderfoot",
      run: "scan1",
      recordRef: "hashA",
      module: "sfp_dnsresolve",
      confidence: 100,
    }),
  };
  assert.equal(relation.source.value, "example.com");
  assert.equal(relation.provenance.tool, "spiderfoot");
  assert.equal(relation.provenance.recordRef, "hashA");
});

test("a tool with no records still produces a valid relation", () => {
  const relation: Relation = {
    source: createEntity("EMAIL", "ana@example.com"),
    target: createEntity("ACCOUNT", "aa"),
    provenance: createProvenance({ tool: "mailscan", run: "run-001" }),
  };
  assert.equal(relation.provenance.recordRef, undefined);
});
