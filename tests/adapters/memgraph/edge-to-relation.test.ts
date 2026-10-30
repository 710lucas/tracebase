import { test } from "node:test";
import assert from "node:assert/strict";
import { edgeToRelation } from "../../../src/adapters/memgraph/edge-to-relation.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../src/core/domain/provenance/index.ts";
import { createRelation } from "../../../src/core/domain/relation/index.ts";

const ends = {
  sourceType: "DOMAIN_NAME",
  sourceValue: "example.com",
  targetType: "IP_ADDRESS",
  targetValue: "93.184.216.34",
};

test("an edge with only the required properties becomes the relation that was saved", () => {
  const relation = edgeToRelation({
    ...ends,
    properties: { key: "k1", tool: "spiderfoot", run: "scan-1" },
  });

  assert.deepEqual(
    relation,
    createRelation({
      source: createEntity("DOMAIN_NAME", "example.com"),
      target: createEntity("IP_ADDRESS", "93.184.216.34"),
      provenance: createProvenance({ tool: "spiderfoot", run: "scan-1" }),
    }),
  );
});

test("an edge with every property keeps the type text, the references and the provenance", () => {
  const relation = edgeToRelation({
    ...ends,
    properties: {
      key: "k1",
      tool: "spiderfoot",
      run: "scan-1",
      module: "sfp_dnsresolve",
      confidence: 90,
      recordRef: "hash-1",
      observedAt: 1000,
      recordedAt: 2000,
      type: "resolves-to",
      viaRecordRefs: ["hash-via"],
    },
  });

  assert.deepEqual(
    relation,
    createRelation({
      source: createEntity("DOMAIN_NAME", "example.com"),
      target: createEntity("IP_ADDRESS", "93.184.216.34"),
      provenance: createProvenance({
        tool: "spiderfoot",
        run: "scan-1",
        module: "sfp_dnsresolve",
        confidence: 90,
        recordRef: "hash-1",
        observedAt: 1000,
        recordedAt: 2000,
      }),
      type: "resolves-to",
      viaRecordRefs: ["hash-via"],
    }),
  );
});
