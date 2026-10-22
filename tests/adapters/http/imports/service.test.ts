import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidProvenanceError } from "../../../../src/core/domain/provenance/index.ts";
import { importPayloadSchema } from "../../../../src/adapters/http/imports/import-payload-schema.ts";
import { importBatch } from "../../../../src/adapters/http/imports/service.ts";

const ipAddress = { type: "IP_ADDRESS", value: "93.184.216.34" };

function parsePayload(payload: unknown) {
  return importPayloadSchema.parse(payload);
}

test("returns how many relations and attributes the batch carried", (t) => {
  t.mock.method(console, "log", () => {});
  const payload = parsePayload({
    source: { tool: "spiderfoot", run: "scan-1" },
    relations: [{ source: { type: "DOMAIN_NAME", value: "example.com" }, target: ipAddress }],
    attributes: [{ entity: ipAddress, name: "WEBSERVER_BANNER", value: "nginx/1.25" }],
  });

  assert.deepEqual(importBatch(payload), { relations: 1, attributes: 1 });
});

test("lets the domain error reach the caller when a value is rejected", () => {
  const payload = parsePayload({
    source: { tool: "spiderfoot", run: "scan-1" },
    attributes: [
      { entity: ipAddress, name: "BANNER", value: "x", provenance: { confidence: 101 } },
    ],
  });

  assert.throws(() => importBatch(payload), InvalidProvenanceError);
});
