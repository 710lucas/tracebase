import { test } from "node:test";
import assert from "node:assert/strict";
import { createStatusService } from "../../../../src/adapters/http/status/service.ts";
import { createInMemoryGraphRepository } from "../../../../src/adapters/memory/in-memory-graph-repository.ts";

test("reports the storage and the size of the graph when the storage answers", async () => {
  const service = createStatusService(createInMemoryGraphRepository(), { storage: "memory" });

  assert.deepEqual(await service.getStatus(), {
    storage: "memory",
    reachable: true,
    totals: { entities: 0, relations: 0, attributes: 0 },
  });
});

test("shows the Memgraph address without the user and password", async () => {
  const service = createStatusService(createInMemoryGraphRepository(), {
    storage: "memgraph",
    memgraphUrl: "bolt://lucas:secret@localhost:7687",
  });

  const status = await service.getStatus();

  assert.equal(status.memgraphUrl, "bolt://localhost:7687");
  assert.doesNotMatch(JSON.stringify(status), /secret/);
});

test("shows an address that is not a URL as it came", async () => {
  const service = createStatusService(createInMemoryGraphRepository(), {
    storage: "memgraph",
    memgraphUrl: "not an address",
  });

  assert.equal((await service.getStatus()).memgraphUrl, "not an address");
});

test("reports a storage that does not answer instead of failing", async () => {
  const service = createStatusService(
    {
      ...createInMemoryGraphRepository(),
      graphTotals: async () => {
        throw new Error("connection lost");
      },
    },
    { storage: "memgraph", memgraphUrl: "bolt://localhost:7687" },
  );

  assert.deepEqual(await service.getStatus(), {
    storage: "memgraph",
    memgraphUrl: "bolt://localhost:7687",
    reachable: false,
    error: "connection lost",
  });
});
