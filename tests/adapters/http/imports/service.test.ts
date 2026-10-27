import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidProvenanceError } from "../../../../src/core/domain/provenance/index.ts";
import { createInMemoryGraphRepository } from "../../../../src/adapters/memory/in-memory-graph-repository.ts";
import { importPayloadSchema } from "../../../../src/adapters/http/imports/import-payload-schema.ts";
import { createImportsService } from "../../../../src/adapters/http/imports/service.ts";

const ipAddress = { type: "IP_ADDRESS", value: "93.184.216.34" };

function parsePayload(payload: unknown) {
  return importPayloadSchema.parse(payload);
}

const validPayload = parsePayload({
  source: { tool: "spiderfoot", run: "scan-1" },
  relations: [{ source: { type: "DOMAIN_NAME", value: "example.com" }, target: ipAddress }],
  attributes: [{ entity: ipAddress, name: "WEBSERVER_BANNER", value: "nginx/1.25" }],
});

test("saves the relations and attributes of the batch and counts them", async (t) => {
  t.mock.method(console, "log", () => {});
  const repository = createInMemoryGraphRepository();

  const result = await createImportsService(repository).importBatch(validPayload);

  assert.deepEqual(result, { relations: 1, attributes: 1 });
  assert.equal(repository.relations[0]?.target.value, "93.184.216.34");
  assert.equal(repository.relations[0]?.provenance.run, "scan-1");
  assert.equal(repository.attributes[0]?.name, "WEBSERVER_BANNER");
});

test("lets the domain error reach the caller and saves nothing when a value is rejected", async () => {
  const repository = createInMemoryGraphRepository();
  const payload = parsePayload({
    source: { tool: "spiderfoot", run: "scan-1" },
    relations: [{ source: { type: "DOMAIN_NAME", value: "example.com" }, target: ipAddress }],
    attributes: [
      { entity: ipAddress, name: "BANNER", value: "x", provenance: { confidence: 101 } },
    ],
  });

  await assert.rejects(
    createImportsService(repository).importBatch(payload),
    InvalidProvenanceError,
  );

  assert.deepEqual(repository.relations, []);
  assert.deepEqual(repository.attributes, []);
});

test("lets a failure of the repository reach the caller", async () => {
  const failingRepository = {
    save: async () => {
      throw new Error("storage is down");
    },
  };

  await assert.rejects(
    createImportsService(failingRepository).importBatch(validPayload),
    /storage is down/,
  );
});
