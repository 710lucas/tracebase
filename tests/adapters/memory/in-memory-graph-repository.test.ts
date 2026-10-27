import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryGraphRepository } from "../../../src/adapters/memory/in-memory-graph-repository.ts";
import { createAttribute } from "../../../src/core/domain/attribute/index.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../src/core/domain/provenance/index.ts";
import { createRelation } from "../../../src/core/domain/relation/index.ts";

const provenance = createProvenance({ tool: "spiderfoot", run: "scan-1" });
const domain = createEntity("DOMAIN_NAME", "example.com");
const address = createEntity("IP_ADDRESS", "93.184.216.34");

const relation = createRelation({ source: domain, target: address, provenance });
const attribute = createAttribute({
  entity: address,
  name: "WEBSERVER_BANNER",
  value: "nginx/1.25",
  provenance,
});

test("starts empty", () => {
  const repository = createInMemoryGraphRepository();

  assert.deepEqual(repository.relations, []);
  assert.deepEqual(repository.attributes, []);
});

test("keeps the relations and attributes of a saved batch", async () => {
  const repository = createInMemoryGraphRepository();

  await repository.save({ relations: [relation], attributes: [attribute] });

  assert.deepEqual(repository.relations, [relation]);
  assert.deepEqual(repository.attributes, [attribute]);
});

test("adds to what was saved before, in order", async () => {
  const repository = createInMemoryGraphRepository();
  const otherRelation = createRelation({ source: address, target: domain, provenance });

  await repository.save({ relations: [relation], attributes: [] });
  await repository.save({ relations: [otherRelation], attributes: [attribute] });

  assert.deepEqual(repository.relations, [relation, otherRelation]);
  assert.deepEqual(repository.attributes, [attribute]);
});

test("saving an empty batch changes nothing", async () => {
  const repository = createInMemoryGraphRepository();

  await repository.save({ relations: [], attributes: [] });

  assert.deepEqual(repository.relations, []);
  assert.deepEqual(repository.attributes, []);
});

test("finds an entity by the relations where it is the source or the target", async () => {
  const repository = createInMemoryGraphRepository();
  const otherRelation = createRelation({ source: address, target: domain, provenance });
  const unrelated = createRelation({
    source: createEntity("DOMAIN_NAME", "other.org"),
    target: createEntity("IP_ADDRESS", "10.0.0.1"),
    provenance,
  });
  await repository.save({ relations: [relation, otherRelation, unrelated], attributes: [] });

  const findings = await repository.findEntity(address);

  assert.deepEqual(findings?.relations, [relation, otherRelation]);
  assert.deepEqual(findings?.attributes, []);
});

test("finds the attributes of an entity and echoes the entity", async () => {
  const repository = createInMemoryGraphRepository();
  await repository.save({ relations: [relation], attributes: [attribute] });

  const findings = await repository.findEntity(address);

  assert.equal(findings?.entity, address);
  assert.deepEqual(findings?.attributes, [attribute]);
});

test("an entity mentioned only by an attribute is found", async () => {
  const repository = createInMemoryGraphRepository();
  await repository.save({ relations: [], attributes: [attribute] });

  const findings = await repository.findEntity(address);

  assert.deepEqual(findings?.relations, []);
  assert.deepEqual(findings?.attributes, [attribute]);
});

test("keeps the same fact seen by two runs as two findings", async () => {
  const repository = createInMemoryGraphRepository();
  const secondRun = createProvenance({ tool: "spiderfoot", run: "scan-2" });
  const sameLinkAgain = createRelation({ source: domain, target: address, provenance: secondRun });
  await repository.save({ relations: [relation], attributes: [] });
  await repository.save({ relations: [sameLinkAgain], attributes: [] });

  const findings = await repository.findEntity(domain);

  assert.deepEqual(
    findings?.relations.map((found) => found.provenance.run),
    ["scan-1", "scan-2"],
  );
});

test("answers null for an entity nothing mentions", async () => {
  const repository = createInMemoryGraphRepository();
  await repository.save({ relations: [relation], attributes: [attribute] });

  assert.equal(await repository.findEntity(createEntity("IP_ADDRESS", "10.9.9.9")), null);
});

test("an empty repository answers null", async () => {
  assert.equal(await createInMemoryGraphRepository().findEntity(address), null);
});

test("type and value are compared exactly, so case makes a different entity", async () => {
  const repository = createInMemoryGraphRepository();
  await repository.save({ relations: [relation], attributes: [] });

  assert.equal(await repository.findEntity(createEntity("DOMAIN_NAME", "Example.com")), null);
  assert.equal(await repository.findEntity(createEntity("domain_name", "example.com")), null);
});

test("saves a very large batch", async () => {
  const repository = createInMemoryGraphRepository();
  const relations = Array.from({ length: 200_000 }, () => relation);

  await repository.save({ relations, attributes: [] });

  assert.equal(repository.relations.length, 200_000);
});
