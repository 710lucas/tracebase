import type { GraphRepository } from "../../core/ports/graph-repository/index.ts";
import { buildAttributeWrites } from "./build-attribute-writes.ts";
import { buildEntityWrites } from "./build-entity-writes.ts";
import { buildRelationWrites } from "./build-relation-writes.ts";
import { decideAttributeWrites } from "./decide-attribute-writes.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";
import { ensureMemgraphSchema } from "./memgraph-schema.ts";
import { readStoredAttributes } from "./read-stored-attributes.ts";

// The `GraphRepository` that keeps the graph in Memgraph. It prepares the schema first, so a
// repository that was returned is ready to use.
//
// An import is written in ONE transaction: if something fails halfway, nothing of it stays, and the
// sender can send the same import again. What the attributes change is decided before the transaction
// starts, from the records the database has at that moment; with one import at a time (v1) nothing
// else can change them in between.
//
// EXPAND: reading an entity (slice 4d). Until then, reading says it is not there yet.
export async function createMemgraphGraphRepository(
  connection: MemgraphConnection,
): Promise<GraphRepository> {
  await ensureMemgraphSchema(connection);

  return {
    save: async (batch) => {
      const stored = await readStoredAttributes(connection, batch.attributes);
      const attributeWrites = decideAttributeWrites(batch.attributes, stored);

      const entities = [
        ...batch.relations.flatMap((relation) => [relation.source, relation.target]),
        ...batch.attributes.map((attribute) => attribute.entity),
      ];

      // The entities come first: edges and attributes are written onto entities that must exist.
      await connection.runInTransaction([
        ...buildEntityWrites(entities),
        ...buildRelationWrites(batch.relations),
        ...buildAttributeWrites(attributeWrites),
      ]);
    },

    findEntity: async () => {
      throw new Error("reading an entity from Memgraph is not implemented yet");
    },
  };
}
