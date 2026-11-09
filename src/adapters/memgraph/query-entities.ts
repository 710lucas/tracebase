import { createEntity } from "../../core/domain/entity/index.ts";
import {
  createEntityQueryCountsByType,
  createEntityQueryPage,
  resolveEntityQuery,
  type EntityQuery,
  type EntityQueryAnswer,
  type FoundByQuery,
  type FoundQueryMatch,
  type QueryOptions,
  type ResolvedAttributeCondition,
  type ResolvedEntityQuery,
} from "../../core/ports/graph-repository/index.ts";
import { fromQualifierKey } from "./attribute-record.ts";
import {
  attributeParameterName,
  attributeParameterPrefix,
  buildEntityQueryConditions,
} from "./entity-query-conditions.ts";
import { createMatchPredicate } from "./match-predicate.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";
import { withinTimeLimit } from "./within-time-limit.ts";

interface EntityRow {
  type: string;
  value: string;
}

interface CountRow {
  type: string;
  count: number;
}

interface AttributeMatchRow extends EntityRow {
  name: string;
  qualifierKey: string;
  matched: string;
}

// The structured query (see `EntityQuery`). The conditions become one `WHERE` (`entity-query-conditions.ts`).
// In the mode `count` one query counts the entities by type. In the mode `list`, one query asks for the entities
// up to the end of the page and one more (to know whether more exist), in the order of the answer, and then,
// for each attribute condition that has a text, one query tells where the entities of the page met it (the
// current sets and, with `includeHistory`, the replaced ones). The page is made by `createEntityQueryPage`,
// the same as in memory. The time limit is for the whole answer, not for each query (`withinTimeLimit`).
export async function queryEntities(
  connection: MemgraphConnection,
  query?: EntityQuery,
  options: QueryOptions = {},
): Promise<EntityQueryAnswer> {
  const resolved = resolveEntityQuery(query);
  const run = withinTimeLimit(connection, options);
  const { conditions, parameters } = buildEntityQueryConditions(resolved);
  const matching = `MATCH (n:Entity)${conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : ""}`;

  if (resolved.mode === "count") {
    const rows = (await run(
      `${matching} RETURN n.type AS type, count(n) AS count`,
      parameters,
    )) as unknown as CountRow[];
    return createEntityQueryCountsByType(rows);
  }

  const rows = (await run(
    `${matching} RETURN n.type AS type, n.value AS value ORDER BY value, type LIMIT toInteger($needed)`,
    { ...parameters, needed: resolved.offset + resolved.limit + 1 },
  )) as unknown as EntityRow[];

  const pageKeys = rows
    .slice(resolved.offset, resolved.offset + resolved.limit)
    .map(({ type, value }) => ({ type, value }));
  const matchesByEntity = await whereConditionsWereMet(run, resolved, parameters, pageKeys);

  const found: FoundByQuery[] = rows.map(({ type, value }) => ({
    entity: createEntity(type, value),
    matches: matchesByEntity.get(JSON.stringify([type, value])) ?? [],
  }));

  return createEntityQueryPage({ query: resolved, found });
}

type Run = ReturnType<typeof withinTimeLimit>;

// Where each attribute condition with a text was met, for the entities of the page, by the key of the entity.
async function whereConditionsWereMet(
  run: Run,
  query: ResolvedEntityQuery,
  parameters: Record<string, unknown>,
  keys: readonly EntityRow[],
): Promise<Map<string, FoundQueryMatch[]>> {
  const matchesByEntity = new Map<string, FoundQueryMatch[]>();
  if (keys.length === 0) return matchesByEntity;

  for (const [position, condition] of query.attributes.entries()) {
    if (condition.text === undefined) continue;

    const queries = [
      { text: currentMatchesQuery(condition, position), history: false },
      ...(query.includeHistory
        ? [{ text: historyMatchesQuery(condition, position), history: true }]
        : []),
    ];
    for (const { text, history } of queries) {
      const rows = (await run(text, { ...parameters, keys })) as unknown as AttributeMatchRow[];
      for (const row of rows) {
        const qualifier = fromQualifierKey(row.qualifierKey);
        const key = JSON.stringify([row.type, row.value]);
        matchesByEntity.set(key, [
          ...(matchesByEntity.get(key) ?? []),
          {
            condition: position,
            name: row.name,
            ...(qualifier !== undefined && { qualifier }),
            value: row.matched,
            history,
          },
        ]);
      }
    }
  }

  return matchesByEntity;
}

function matchCondition(condition: ResolvedAttributeCondition, position: number): string {
  return createMatchPredicate(
    condition.text as string,
    condition.match,
    attributeParameterPrefix(position),
  ).condition("candidate");
}

// One row for each current attribute (name and qualifier) of the entities of the page that is named like the
// condition and has a value with the text, with the first such value (the values are sorted).
function currentMatchesQuery(condition: ResolvedAttributeCondition, position: number): string {
  const qualifierCheck =
    condition.qualifier === undefined
      ? ""
      : `WITH n, name, qualifierKey WHERE qualifierKey = $${attributeParameterName(position, "Qualifier")} `;

  return (
    "UNWIND $keys AS key " +
    "MATCH (n:Entity {type: key.type, value: key.value}) " +
    "WHERE n.attributes IS NOT NULL " +
    "UNWIND keys(n.attributes) AS name " +
    `WITH n, name WHERE name = $${attributeParameterName(position, "Name")} ` +
    "UNWIND keys(n.attributes[name]) AS qualifierKey " +
    qualifierCheck +
    "WITH n, name, qualifierKey, " +
    `[candidate IN n.attributes[name][qualifierKey].values WHERE ${matchCondition(condition, position)}] AS hits ` +
    "WHERE size(hits) > 0 " +
    "RETURN n.type AS type, n.value AS value, name, qualifierKey, hits[0] AS matched"
  );
}

// The same for the replaced sets, kept as `:Attribute` nodes: one row for each such node that matches.
function historyMatchesQuery(condition: ResolvedAttributeCondition, position: number): string {
  const qualifierCheck =
    condition.qualifier === undefined
      ? ""
      : ` AND h.qualifier = $${attributeParameterName(position, "Qualifier")}`;

  return (
    "UNWIND $keys AS key " +
    "MATCH (n:Entity {type: key.type, value: key.value})-[:HAS_ATTRIBUTE]->(h:Attribute) " +
    `WHERE h.name = $${attributeParameterName(position, "Name")}${qualifierCheck} ` +
    "WITH n, h, " +
    `[candidate IN h.values WHERE ${matchCondition(condition, position)}] AS hits ` +
    "WHERE size(hits) > 0 " +
    'RETURN n.type AS type, n.value AS value, h.name AS name, coalesce(h.qualifier, "") AS qualifierKey, hits[0] AS matched'
  );
}
