import { test } from "node:test";
import assert from "node:assert/strict";
import { recordToAttribute } from "../../../src/adapters/memgraph/record-to-attribute.ts";
import { createAttribute } from "../../../src/core/domain/attribute/index.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../src/core/domain/provenance/index.ts";

const entity = createEntity("IP_ADDRESS", "93.184.216.34");

test("a record with only the required fields becomes the attribute that was saved", () => {
  const attribute = recordToAttribute(entity, "banner", undefined, {
    key: "k1",
    values: ["nginx"],
    tool: "spiderfoot",
    run: "scan-1",
  });

  assert.deepEqual(
    attribute,
    createAttribute({
      entity,
      name: "banner",
      values: ["nginx"],
      provenance: createProvenance({ tool: "spiderfoot", run: "scan-1" }),
    }),
  );
});

test("the storage fields (key, updatedAt) are not part of the attribute", () => {
  const attribute = recordToAttribute(entity, "banner", undefined, {
    key: "k1",
    values: ["nginx"],
    tool: "spiderfoot",
    run: "scan-1",
    module: "sfp_portscan_tcp",
    confidence: 80,
    recordRef: "hash-1",
    observedAt: 1000,
    recordedAt: 2000,
    updatedAt: 3000,
  });

  assert.deepEqual(
    attribute,
    createAttribute({
      entity,
      name: "banner",
      values: ["nginx"],
      provenance: createProvenance({
        tool: "spiderfoot",
        run: "scan-1",
        module: "sfp_portscan_tcp",
        confidence: 80,
        recordRef: "hash-1",
        observedAt: 1000,
        recordedAt: 2000,
      }),
    }),
  );
});

test("the qualifier given with the record becomes the qualifier of the attribute", () => {
  const attribute = recordToAttribute(entity, "banner", "sfp_webserver", {
    key: "k1",
    values: ["nginx"],
    tool: "spiderfoot",
    run: "scan-1",
  });

  assert.equal(attribute.qualifier, "sfp_webserver");
});
