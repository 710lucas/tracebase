import { test } from "node:test";
import assert from "node:assert/strict";
import { createGraphRepository } from "../src/create-graph-repository.ts";
import { createEntity } from "../src/core/domain/entity/index.ts";

test("keeps the graph in memory when no Memgraph address is given", async () => {
  const repository = await createGraphRepository({});

  assert.equal(await repository.findEntity(createEntity("IP_ADDRESS", "1.1.1.1")), null);
});

test("treats an empty address as no address", async () => {
  const repository = await createGraphRepository({ memgraphUrl: "" });

  assert.equal(await repository.findEntity(createEntity("IP_ADDRESS", "1.1.1.1")), null);
});

test("fails, and says where it tried to connect, when the given Memgraph does not answer", async () => {
  await assert.rejects(
    createGraphRepository({ memgraphUrl: "bolt://localhost:1" }),
    /could not reach Memgraph at bolt:\/\/localhost:1/,
  );
});

test("an empty user and password count as not given", async () => {
  const repository = await createGraphRepository({
    memgraphUser: "",
    memgraphPassword: "",
  });

  assert.equal(await repository.findEntity(createEntity("IP_ADDRESS", "1.1.1.1")), null);
});

test("a password with no user is refused, so a wrong configuration is not ignored", async () => {
  await assert.rejects(
    createGraphRepository({ memgraphUrl: "bolt://localhost:1", memgraphPassword: "secret" }),
    /MEMGRAPH_PASSWORD is set but MEMGRAPH_USER is not/,
  );
});

test("the failure to connect with credentials says where, and never shows the password", async () => {
  const error = await createGraphRepository({
    memgraphUrl: "bolt://localhost:1",
    memgraphUser: "analyst",
    memgraphPassword: "secret-password",
  }).then(
    () => null,
    (failure: Error) => failure,
  );

  assert.match(error?.message ?? "", /could not reach Memgraph at bolt:\/\/localhost:1/);
  assert.doesNotMatch(error?.message ?? "", /secret-password/);
});
