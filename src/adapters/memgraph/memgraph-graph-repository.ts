import type { GraphRepository } from "../../core/ports/graph-repository/index.ts";
import { buildRelationWrites } from "./build-relation-writes.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";
import { ensureMemgraphSchema } from "./memgraph-schema.ts";

// The `GraphRepository` that keeps the graph in Memgraph. It prepares the schema first, so a
// repository that was returned is ready to use.
//
// An import is written in ONE transaction: if something fails halfway, nothing of it stays, and the
// sender can send the same import again.
//
// EXPAND: attributes (slices 4c-1 and 4c-2) and reading an entity (slice 4d). Until then, a batch with
// attributes is refused instead of silently losing them, and reading says it is not there yet.
export async function createMemgraphGraphRepository(
  connection: MemgraphConnection,
): Promise<GraphRepository> {
  await ensureMemgraphSchema(connection);

  return {
    save: async (batch) => {
      if (batch.attributes.length > 0) {
        throw new Error("storing attributes in Memgraph is not implemented yet");
      }

      await connection.runInTransaction(buildRelationWrites(batch.relations));
    },

    findEntity: async () => {
      throw new Error("reading an entity from Memgraph is not implemented yet");
    },
  };
}
