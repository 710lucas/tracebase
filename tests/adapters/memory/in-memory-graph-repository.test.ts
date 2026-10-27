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

test("saves a very large batch", async () => {
  const repository = createInMemoryGraphRepository();
  const relations = Array.from({ length: 200_000 }, () => relation);

  await repository.save({ relations, attributes: [] });

  assert.equal(repository.relations.length, 200_000);
});
