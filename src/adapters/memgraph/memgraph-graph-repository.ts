import type { GraphRepository } from "../../core/ports/graph-repository/index.ts";
import { buildAttributeWrites } from "./build-attribute-writes.ts";
import { buildEntityWrites } from "./build-entity-writes.ts";
import { buildRelationWrites } from "./build-relation-writes.ts";
import { decideAttributeWrites } from "./decide-attribute-writes.ts";
import { getEntityDegree } from "./get-entity-degree.ts";
import { getMostConnected } from "./get-most-connected.ts";
import { queryEntities } from "./query-entities.ts";
import { searchEntities } from "./search-entities.ts";
import { getShortestPath } from "./get-shortest-path.ts";
import { getEntityNeighbourhood } from "./get-entity-neighbourhood.ts";
import { findEntity } from "./find-entity.ts";
import { graphTotals } from "./graph-totals.ts";
import { listEntities } from "./list-entities.ts";
import { listEntityTypes } from "./list-entity-types.ts";
import { listRuns } from "./list-runs.ts";
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

    findEntity: (entity) => findEntity(connection, entity),

    listRuns: () => listRuns(connection),

    listEntityTypes: () => listEntityTypes(connection),

    listEntities: (query) => listEntities(connection, query),

    graphTotals: () => graphTotals(connection),

    getEntityDegree: (entity, options) => getEntityDegree(connection, entity, options),

    getEntityNeighbourhood: (entity, options) =>
      getEntityNeighbourhood(connection, entity, options),

    getShortestPath: (from, to, options) => getShortestPath(connection, from, to, options),

    searchEntities: (text, options) => searchEntities(connection, text, options),

    queryEntities: (query, options) => queryEntities(connection, query, options),

    getMostConnectedEntities: (options) => getMostConnected(connection, options),
  };
}
