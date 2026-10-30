import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  connectToMemgraph,
  DEFAULT_MEMGRAPH_URL,
  type MemgraphConnection,
} from "../../../src/adapters/memgraph/memgraph-connection.ts";
import { ensureMemgraphSchema } from "../../../src/adapters/memgraph/memgraph-schema.ts";

// Needs a running Memgraph, like the connection tests; skipped when none answers.
async function tryConnecting(): Promise<MemgraphConnection | null> {
  try {
    return await connectToMemgraph({ url: process.env["MEMGRAPH_URL"] ?? DEFAULT_MEMGRAPH_URL });
  } catch {
    return null;
  }
}

const connection = await tryConnecting();
const skipWithoutMemgraph = connection === null ? "no Memgraph is running" : false;

after(async () => {
  await connection?.close();
});

test(
  "creates the unique constraints and the indexes on entities and replaced attributes, and can run again",
  { skip: skipWithoutMemgraph },
  async () => {
    const memgraph = connection as MemgraphConnection;

    await ensureMemgraphSchema(memgraph);
    await ensureMemgraphSchema(memgraph);

    const constraints = await memgraph.run("SHOW CONSTRAINT INFO");
    const indexes = await memgraph.run("SHOW INDEX INFO");

    for (const label of ["Entity", "Attribute"]) {
      assert.equal(
        constraints.filter((row) => row["label"] === label && row["constraint type"] === "unique")
          .length,
        1,
      );
      assert.equal(indexes.filter((row) => row["label"] === label).length, 1);
    }
  },
);
