import { createEntity } from "../../core/domain/entity/index.ts";
import type { EntityListQuery, EntityPage } from "../../core/ports/graph-repository/index.ts";
import { createMatchPredicate } from "./match-predicate.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";

// One page of the entities of one type, ordered by value so that pages never overlap. Without a `search`
// there is no filter; with one it keeps the values that match it the way `match` says (`match-predicate.ts`:
// exact, contains, or contains ignoring case and accents, the default). The search text travels as a
// parameter like every other value.
//
// The total comes from a second query with the same filter, so a caller can tell whether another page
// exists. The entities are rebuilt through `createEntity`, like everything that leaves the adapter.
export async function listEntities(
  connection: MemgraphConnection,
  query: EntityListQuery,
): Promise<EntityPage> {
  const predicate =
    query.search === undefined
      ? undefined
      : createMatchPredicate(query.search, query.match ?? "insensitive");
  const matching = `MATCH (n:Entity {type: $type})${
    predicate === undefined ? "" : ` WHERE ${predicate.condition("n.value")}`
  }`;
  const filter = { type: query.type, ...predicate?.parameters };

  const [totalRow] = await connection.run(`${matching} RETURN count(n) AS total`, filter);

  const rows = await connection.run(
    `${matching} RETURN n.value AS value ORDER BY value SKIP toInteger($offset) LIMIT toInteger($limit)`,
    { ...filter, offset: query.offset, limit: query.limit },
  );

  return {
    total: (totalRow?.["total"] ?? 0) as number,
    entities: rows.map((row) => createEntity(query.type, row["value"] as string)),
  };
}
