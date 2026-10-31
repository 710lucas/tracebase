import { test } from "node:test";
import assert from "node:assert/strict";
import { createGraphRepository } from "../src/create-graph-repository.ts";
import { createEntity } from "../src/core/domain/entity/index.ts";

test("keeps the graph in memory when no Memgraph address is given", async () => {
  const repository = await createGraphRepository(undefined);

  assert.equal(await repository.findEntity(createEntity("IP_ADDRESS", "1.1.1.1")), null);
});

test("treats an empty address as no address", async () => {
  const repository = await createGraphRepository("");

  assert.equal(await repository.findEntity(createEntity("IP_ADDRESS", "1.1.1.1")), null);
});

test("fails, and says where it tried to connect, when the given Memgraph does not answer", async () => {
  await assert.rejects(
    createGraphRepository("bolt://localhost:1"),
    /could not reach Memgraph at bolt:\/\/localhost:1/,
  );
});
