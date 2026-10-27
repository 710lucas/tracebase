import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryGraphRepository } from "../../../../src/adapters/memory/in-memory-graph-repository.ts";
import { createGraphService } from "../../../../src/adapters/http/graph/service.ts";
import { createAttribute } from "../../../../src/core/domain/attribute/index.ts";
import { createEntity, InvalidEntityError } from "../../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../../src/core/domain/provenance/index.ts";

const address = createEntity("IP_ADDRESS", "93.184.216.34");
const attribute = createAttribute({
  entity: address,
  name: "WEBSERVER_BANNER",
  value: "nginx/1.25",
  provenance: createProvenance({ tool: "spiderfoot", run: "scan-1" }),
});

async function serviceWithAttribute() {
  const repository = createInMemoryGraphRepository();
  await repository.save({ relations: [], attributes: [attribute] });
  return createGraphService(repository);
}

test("finds what the graph holds about an entity", async () => {
  const findings = await (await serviceWithAttribute()).findEntity("IP_ADDRESS", "93.184.216.34");

  assert.deepEqual(findings?.entity, address);
  assert.deepEqual(findings?.attributes, [attribute]);
});

test("normalizes the text like an import does, so stray spaces still find the entity", async () => {
  const findings = await (
    await serviceWithAttribute()
  ).findEntity(" IP_ADDRESS ", "93.184.216.34 ");

  assert.deepEqual(findings?.attributes, [attribute]);
});

test("answers null when nothing in the graph mentions the entity", async () => {
  const findings = await (await serviceWithAttribute()).findEntity("IP_ADDRESS", "10.0.0.99");

  assert.equal(findings, null);
});

test("lets the domain error reach the caller when the type or the value is blank", async () => {
  const service = await serviceWithAttribute();

  await assert.rejects(service.findEntity("  ", "93.184.216.34"), InvalidEntityError);
  await assert.rejects(service.findEntity("IP_ADDRESS", ""), InvalidEntityError);
});
