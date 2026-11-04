import { test } from "node:test";
import assert from "node:assert/strict";
import { createGraphRepository } from "../src/create-graph-repository.ts";
import { DEFAULT_MEMGRAPH_URL } from "../src/adapters/memgraph/memgraph-connection.ts";
import { createEntity } from "../src/core/domain/entity/index.ts";

test("keeps the graph in memory when no Memgraph address is given", async () => {
  const { repository } = await createGraphRepository({});

  assert.equal(await repository.findEntity(createEntity("IP_ADDRESS", "1.1.1.1")), null);
});

test("treats an empty address as no address", async () => {
  const { repository } = await createGraphRepository({ memgraphUrl: "" });

  assert.equal(await repository.findEntity(createEntity("IP_ADDRESS", "1.1.1.1")), null);
});

test("fails, and says where it tried to connect, when the given Memgraph does not answer", async () => {
  await assert.rejects(
    createGraphRepository({ memgraphUrl: "bolt://localhost:1" }),
    /could not reach Memgraph at bolt:\/\/localhost:1/,
  );
});

test("an empty user and password count as not given", async () => {
  const { repository } = await createGraphRepository({
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

test("closing the memory repository does nothing and can be done twice", async () => {
  const { close } = await createGraphRepository({});

  await close();
  await close();
});

// Needs a running Memgraph; skipped when none answers, like the other Memgraph tests.
const memgraphUrl = process.env["MEMGRAPH_URL"] ?? DEFAULT_MEMGRAPH_URL;
const memgraph = await createGraphRepository({ memgraphUrl }).catch(() => null);
const skipWithoutMemgraph = memgraph === null ? "no Memgraph is running" : false;

test(
  "keeps the graph in Memgraph when it answers, and close ends the connection",
  { skip: skipWithoutMemgraph },
  async () => {
    const { repository, close } = memgraph as NonNullable<typeof memgraph>;

    // A value that no real scan has, so a Memgraph with data answers null for it too.
    assert.equal(
      await repository.findEntity(createEntity("IP_ADDRESS", "__test__no-such-entity")),
      null,
    );

    await close();
    await assert.rejects(repository.findEntity(createEntity("IP_ADDRESS", "__test__x")));
  },
);
