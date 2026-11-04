import { createEntity } from "../../core/domain/entity/index.ts";
import type { EntityListQuery, EntityPage } from "../../core/ports/graph-repository/index.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";

// One page of the entities of one type, ordered by value so that pages never overlap. Without a
// `search` the filter is a no-op (`$search IS NULL`); with one it keeps the values that contain it,
// ignoring case. The search text travels as a parameter like every other value.
//
// The total comes from a second query with the same filter, so a caller can tell whether another page
// exists. The entities are rebuilt through `createEntity`, like everything that leaves the adapter.
const MATCHING = `MATCH (n:Entity {type: $type})
   WHERE $search IS NULL OR toLower(n.value) CONTAINS toLower($search)`;
const COUNT_MATCHING = `${MATCHING} RETURN count(n) AS total`;
const PAGE_OF_MATCHING = `${MATCHING} RETURN n.value AS value ORDER BY value SKIP toInteger($offset) LIMIT toInteger($limit)`;

export async function listEntities(
  connection: MemgraphConnection,
  query: EntityListQuery,
): Promise<EntityPage> {
  const filter = { type: query.type, search: query.search ?? null };

  const [totalRow] = await connection.run(COUNT_MATCHING, filter);

  const rows = await connection.run(PAGE_OF_MATCHING, {
    ...filter,
    offset: query.offset,
    limit: query.limit,
  });

  return {
    total: (totalRow?.["total"] ?? 0) as number,
    entities: rows.map((row) => createEntity(query.type, row["value"] as string)),
  };
}
