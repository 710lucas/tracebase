import { createEntity } from "../../core/domain/entity/index.ts";
import {
  createEntitySearchPage,
  resolveSearch,
  type EntitySearchPage,
  type FoundEntity,
  type FoundMatch,
  type QueryOptions,
  type SearchOptions,
} from "../../core/ports/graph-repository/index.ts";
import { fromQualifierKey } from "./attribute-record.ts";
import { caseVariants } from "./case-variants.ts";
import type { MemgraphConnection } from "./memgraph-connection.ts";
import { withinTimeLimit } from "./within-time-limit.ts";

// The first group of the results: the entities whose VALUE contains the text, in the order of the answer
// (value, then type) and as far as `LIMIT`. `$variants` are the ways the text may be written so that Memgraph
// ignores the case (`case-variants.ts`); the value is lowered by the database.
const ENTITIES_WITH_MATCHING_VALUE =
  "MATCH (n:Entity) " +
  "WHERE any(variant IN $variants WHERE toLower(n.value) CONTAINS variant) " +
  "RETURN n.type AS type, n.value AS value " +
  "ORDER BY value, type LIMIT toInteger($limit)";

// The second group: the entities whose value does NOT contain the text but that have a current attribute with a
// value that does. The attributes are in the map property `attributes` of the node (name, then qualifier).
const ENTITIES_WITH_MATCHING_ATTRIBUTE =
  "MATCH (n:Entity) " +
  "WHERE n.attributes IS NOT NULL " +
  "AND none(variant IN $variants WHERE toLower(n.value) CONTAINS variant) " +
  "AND any(name IN keys(n.attributes) WHERE " +
  "any(qualifierKey IN keys(n.attributes[name]) WHERE " +
  "any(candidate IN n.attributes[name][qualifierKey].values WHERE " +
  "any(variant IN $variants WHERE toLower(candidate) CONTAINS variant)))) " +
  "RETURN n.type AS type, n.value AS value " +
  "ORDER BY value, type LIMIT toInteger($limit)";

// Where the text matched in the attributes of the entities of the page: one row for each attribute (name and
// qualifier) that has a value with the text, with the first such value (the values are sorted).
const ATTRIBUTE_MATCHES_OF_ENTITIES =
  "UNWIND $keys AS key " +
  "MATCH (n:Entity {type: key.type, value: key.value}) " +
  "WHERE n.attributes IS NOT NULL " +
  "UNWIND keys(n.attributes) AS name " +
  "UNWIND keys(n.attributes[name]) AS qualifierKey " +
  "WITH n, name, qualifierKey, " +
  "[candidate IN n.attributes[name][qualifierKey].values " +
  "WHERE any(variant IN $variants WHERE toLower(candidate) CONTAINS variant)] AS hits " +
  "WHERE size(hits) > 0 " +
  "RETURN n.type AS type, n.value AS value, name, qualifierKey, hits[0] AS matched";

interface EntityRow {
  type: string;
  value: string;
}

interface AttributeMatchRow extends EntityRow {
  name: string;
  qualifierKey: string;
  matched: string;
}

// One page of the entities that contain a text (see `EntitySearchPage`). The order has two groups, the
// entities whose value matches and then the ones that only match in an attribute, each by value and type, so
// the database is asked for the first group up to the end of the page (plus one, to know whether more
// results exist) and, only if that does not fill it and the scope is `full`, for the second group to fill
// the rest. Then, for the entities of the page, where they matched in their attributes. The time limit is for
// the whole answer, not for each query (`withinTimeLimit`).
export async function searchEntities(
  connection: MemgraphConnection,
  text: string,
  options: QueryOptions & SearchOptions = {},
): Promise<EntitySearchPage> {
  const search = resolveSearch(text, options);
  const run = withinTimeLimit(connection, options);
  const variants = caseVariants(search.text);

  const needed = search.offset + search.limit + 1;
  const valueRows = (await run(ENTITIES_WITH_MATCHING_VALUE, {
    variants,
    limit: needed,
  })) as unknown as EntityRow[];
  const attributeOnlyRows =
    search.scope === "full" && valueRows.length < needed
      ? ((await run(ENTITIES_WITH_MATCHING_ATTRIBUTE, {
          variants,
          limit: needed - valueRows.length,
        })) as unknown as EntityRow[])
      : [];

  const inOrder = [
    ...valueRows.map((row) => ({ row, matchesValue: true })),
    ...attributeOnlyRows.map((row) => ({ row, matchesValue: false })),
  ];

  // Only the entities of the page need to say where they matched in their attributes.
  const pageKeys = inOrder
    .slice(search.offset, search.offset + search.limit)
    .map(({ row }) => ({ type: row.type, value: row.value }));
  const attributeRows =
    search.scope === "full" && pageKeys.length > 0
      ? ((await run(ATTRIBUTE_MATCHES_OF_ENTITIES, {
          variants,
          keys: pageKeys,
        })) as unknown as AttributeMatchRow[])
      : [];
  const attributeMatchesByEntity = new Map<string, FoundMatch[]>();
  for (const row of attributeRows) {
    const qualifier = fromQualifierKey(row.qualifierKey);
    const key = JSON.stringify([row.type, row.value]);
    attributeMatchesByEntity.set(key, [
      ...(attributeMatchesByEntity.get(key) ?? []),
      {
        where: "attribute",
        name: row.name,
        ...(qualifier !== undefined && { qualifier }),
        value: row.matched,
      },
    ]);
  }

  const found: FoundEntity[] = inOrder.map(({ row, matchesValue }) => ({
    entity: createEntity(row.type, row.value),
    matches: [
      ...(matchesValue ? [{ where: "entity-value" as const, value: row.value }] : []),
      ...(attributeMatchesByEntity.get(JSON.stringify([row.type, row.value])) ?? []),
    ],
  }));

  return createEntitySearchPage({ search, found });
}
