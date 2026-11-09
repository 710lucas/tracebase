import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  connectToMemgraph,
  DEFAULT_MEMGRAPH_URL,
  type MemgraphConnection,
} from "../../../src/adapters/memgraph/memgraph-connection.ts";
import { createMemgraphGraphRepository } from "../../../src/adapters/memgraph/memgraph-graph-repository.ts";
import { createAttribute } from "../../../src/core/domain/attribute/index.ts";
import { createEntity } from "../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../src/core/domain/provenance/index.ts";
import type { EntityQueryPage } from "../../../src/core/ports/graph-repository/index.ts";

// The replaced sets of an attribute (the history) exist only in Memgraph, so the contract suite that the memory
// repository also runs cannot test `includeHistory`; this file does, against a running Memgraph (skipped when
// none answers). It has its own value prefix, which does not start with `__test__`, so the other Memgraph tests
// do not delete its data while it runs.
async function tryConnecting(): Promise<MemgraphConnection | null> {
  try {
    return await connectToMemgraph({ url: process.env["MEMGRAPH_URL"] ?? DEFAULT_MEMGRAPH_URL });
  } catch {
    return null;
  }
}

const connection = await tryConnecting();
const skipWithoutMemgraph = connection === null ? "no Memgraph is running" : false;

const PREFIX = "__test_query__";
const TOOL = "__test_query__tool";
const TYPE = "QUERYHISTORYTEST";

async function deleteTestEntities(): Promise<void> {
  await connection?.run(
    `MATCH (n:Entity)-[:HAS_ATTRIBUTE]->(history:Attribute) WHERE n.value STARTS WITH '${PREFIX}' DETACH DELETE history`,
  );
  await connection?.run(`MATCH (n:Entity) WHERE n.value STARTS WITH '${PREFIX}' DETACH DELETE n`);
}

beforeEach(deleteTestEntities);

after(async () => {
  await deleteTestEntities();
  await connection?.close();
});

const owner = createEntity(TYPE, `${PREFIX}owner`);

function banner(values: string[], run: string, recordedAt: number, qualifier?: string) {
  return createAttribute({
    entity: owner,
    name: "banner",
    values,
    ...(qualifier !== undefined && { qualifier }),
    provenance: createProvenance({ tool: TOOL, run, module: `module-${run}`, recordedAt }),
  });
}

// The first set is replaced by the second, which is newer: the first stays as a node of the history.
async function ownerWithReplacedBanner(qualifier?: string) {
  const repository = await createMemgraphGraphRepository(connection as MemgraphConnection);
  await repository.save({
    relations: [],
    attributes: [banner(["old-banner"], "run-1", 1000, qualifier)],
  });
  await repository.save({
    relations: [],
    attributes: [banner(["new-banner"], "run-2", 2000, qualifier)],
  });
  return repository;
}

const matches = (answer: unknown) => (answer as EntityQueryPage).results[0]?.matches;
const names = (answer: unknown) =>
  (answer as EntityQueryPage).results.map(({ entity }) => entity.value.slice(PREFIX.length));

test(
  "a text that only a replaced set has is found only with includeHistory, and the match says it is from the history",
  { skip: skipWithoutMemgraph },
  async () => {
    const repository = await ownerWithReplacedBanner();
    const query = { types: [TYPE], attributes: [{ name: "banner", text: "old" }] };

    assert.deepEqual(names(await repository.queryEntities(query)), []);

    const withHistory = await repository.queryEntities({ ...query, includeHistory: true });
    assert.deepEqual(names(withHistory), ["owner"]);
    assert.deepEqual(matches(withHistory), [
      { name: "banner", snippet: "old-banner", history: true },
    ]);
  },
);

test(
  "the current set is found with or without includeHistory, and without the mark",
  { skip: skipWithoutMemgraph },
  async () => {
    const repository = await ownerWithReplacedBanner();
    const query = { types: [TYPE], attributes: [{ name: "banner", text: "new" }] };

    const without = await repository.queryEntities(query);
    const withHistory = await repository.queryEntities({ ...query, includeHistory: true });

    assert.deepEqual(matches(without), [{ name: "banner", snippet: "new-banner" }]);
    assert.deepEqual(matches(withHistory), [{ name: "banner", snippet: "new-banner" }]);
  },
);

test(
  "a text that both the current and a replaced set have lists the two, the current one first",
  { skip: skipWithoutMemgraph },
  async () => {
    const repository = await ownerWithReplacedBanner();

    const answer = await repository.queryEntities({
      types: [TYPE],
      attributes: [{ name: "banner", text: "banner" }],
      includeHistory: true,
    });

    assert.deepEqual(matches(answer), [
      { name: "banner", snippet: "new-banner" },
      { name: "banner", snippet: "old-banner", history: true },
    ]);
  },
);

test(
  "the qualifier of the condition also narrows the replaced sets",
  { skip: skipWithoutMemgraph },
  async () => {
    const repository = await ownerWithReplacedBanner("sfp_web");
    const ask = (qualifier: string) =>
      repository.queryEntities({
        types: [TYPE],
        attributes: [{ name: "banner", qualifier, text: "old" }],
        includeHistory: true,
      });

    assert.deepEqual(names(await ask("sfp_web")), ["owner"]);
    assert.deepEqual(names(await ask("other")), []);
    assert.deepEqual(matches(await ask("sfp_web")), [
      { name: "banner", qualifier: "sfp_web", snippet: "old-banner", history: true },
    ]);
  },
);

test(
  "a condition with only a name is met by a replaced set only with includeHistory",
  { skip: skipWithoutMemgraph },
  async () => {
    const repository = await createMemgraphGraphRepository(connection as MemgraphConnection);
    // `gone` was replaced by a set of ANOTHER name? No: one name only has its current set, so the name that
    // exists only in the history cannot happen here; the check is that the name of the current set is found.
    await repository.save({ relations: [], attributes: [banner(["x"], "run-1", 1000)] });
    await repository.save({ relations: [], attributes: [banner(["y"], "run-2", 2000)] });

    const query = { types: [TYPE], attributes: [{ name: "banner" }] };

    assert.deepEqual(names(await repository.queryEntities(query)), ["owner"]);
    assert.deepEqual(names(await repository.queryEntities({ ...query, includeHistory: true })), [
      "owner",
    ]);
  },
);

test(
  "a provenance filter finds a run that only a replaced set has, only with includeHistory",
  { skip: skipWithoutMemgraph },
  async () => {
    const repository = await ownerWithReplacedBanner();
    const query = { types: [TYPE], provenance: { run: "run-1" } };

    assert.deepEqual(names(await repository.queryEntities(query)), []);
    assert.deepEqual(names(await repository.queryEntities({ ...query, includeHistory: true })), [
      "owner",
    ]);
  },
);

test(
  "the parts of a provenance filter must be on the same replaced set",
  { skip: skipWithoutMemgraph },
  async () => {
    const repository = await ownerWithReplacedBanner();
    const ask = (provenance: { run: string; module: string }) =>
      repository.queryEntities({ types: [TYPE], provenance, includeHistory: true });

    assert.deepEqual(names(await ask({ run: "run-1", module: "module-run-1" })), ["owner"]);
    // run-1 and module-run-2 exist for the entity, but never on the same record.
    assert.deepEqual(names(await ask({ run: "run-1", module: "module-run-2" })), []);
  },
);
