import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntity } from "../../../../src/core/domain/entity/index.ts";
import {
  InvalidEntityQueryError,
  createEntityQueryCounts,
  createEntityQueryCountsByType,
  createEntityQueryPage,
  resolveEntityQuery,
  type EntityQuery,
  type FoundByQuery,
} from "../../../../src/core/ports/graph-repository/index.ts";

const host = (value: string) => createEntity("HOST", value);
const found = (value: string, matches: FoundByQuery["matches"] = []): FoundByQuery => ({
  entity: host(value),
  matches,
});

function page(query: EntityQuery, entities: FoundByQuery[]) {
  return createEntityQueryPage({ query: resolveEntityQuery(query), found: entities });
}

test("orders the entities by value and then by type, whatever order they came in", () => {
  const answer = page({}, [
    found("b"),
    { entity: createEntity("A_TYPE", "b"), matches: [] },
    found("a"),
  ]);

  assert.deepEqual(
    answer.results.map(({ entity }) => `${entity.type}:${entity.value}`),
    ["HOST:a", "A_TYPE:b", "HOST:b"],
  );
});

test("compares the text character by character, like a database", () => {
  const answer = page({}, [found("a"), found("B"), found("_")]);

  assert.deepEqual(
    answer.results.map(({ entity }) => entity.value),
    ["B", "_", "a"],
  );
});

test("a page repeats what was used and says nothing more when everything fits", () => {
  const answer = page({ snippetLength: 30 }, [found("a")]);

  assert.deepEqual(answer, {
    mode: "list",
    limit: 50,
    offset: 0,
    snippetLength: 30,
    results: [{ entity: host("a"), matches: [] }],
    truncated: false,
  });
  assert.equal("nextOffset" in answer, false);
});

test("cuts the page by limit and offset and says where the next one starts", () => {
  const everything = ["a", "b", "c", "d", "e"].map((value) => found(value));

  const first = page({ limit: 2 }, everything);
  const second = page({ limit: 2, offset: 2 }, everything);
  const last = page({ limit: 2, offset: 4 }, everything);

  assert.deepEqual(
    first.results.map(({ entity }) => entity.value),
    ["a", "b"],
  );
  assert.deepEqual([first.truncated, first.nextOffset], [true, 2]);
  assert.deepEqual(
    second.results.map(({ entity }) => entity.value),
    ["c", "d"],
  );
  assert.deepEqual([second.truncated, second.nextOffset], [true, 4]);
  assert.deepEqual(
    last.results.map(({ entity }) => entity.value),
    ["e"],
  );
  assert.deepEqual([last.truncated, "nextOffset" in last], [false, false]);
});

test("a query that found nothing is an empty page, not an error", () => {
  const answer = page({}, []);

  assert.deepEqual(answer.results, []);
  assert.equal(answer.truncated, false);
});

test("an offset at or past the end of the results is an error", () => {
  for (const offset of [1, 2, 10]) {
    assert.throws(
      () => page({ offset }, [found("a")]),
      (error: unknown) =>
        error instanceof InvalidEntityQueryError &&
        error.message.includes(`offset ${offset} is past the end: the query found 1 entities`),
    );
  }
});

test("a snippet is made from the text and the way of the condition that met it", () => {
  const value = `${"a".repeat(50)}CAFÉ${"b".repeat(50)}`;
  const answer = page({ attributes: [{ name: "note", text: "cafe" }], snippetLength: 20 }, [
    found("h", [{ condition: 0, name: "note", qualifier: "q", value }]),
  ]);

  assert.deepEqual(answer.results[0]?.matches, [
    { name: "note", qualifier: "q", snippet: `…${"a".repeat(8)}CAFÉ${"b".repeat(8)}…` },
  ]);
});

test("a value that fits is shown whole, and a match without a qualifier has none", () => {
  const answer = page({ attributes: [{ name: "note", text: "x" }] }, [
    found("h", [{ condition: 0, name: "note", value: "has x" }]),
  ]);

  assert.deepEqual(answer.results[0]?.matches, [{ name: "note", snippet: "has x" }]);
});

test("a match from the history is marked, and a current one has no mark", () => {
  const answer = page({ attributes: [{ name: "note", text: "x" }], includeHistory: true }, [
    found("h", [
      { condition: 0, name: "note", value: "old x", history: true },
      { condition: 0, name: "note", value: "new x", history: false },
    ]),
  ]);

  assert.deepEqual(answer.results[0]?.matches, [
    { name: "note", snippet: "new x" },
    { name: "note", snippet: "old x", history: true },
  ]);
});

test("the matches of an entity are ordered by name, qualifier, current before history and condition", () => {
  const answer = page(
    {
      attributes: [
        { name: "b", text: "x" },
        { name: "a", text: "y" },
      ],
    },
    [
      found("h", [
        { condition: 0, name: "b", qualifier: "q2", value: "x" },
        { condition: 0, name: "b", qualifier: "q1", value: "x" },
        { condition: 1, name: "a", value: "y" },
        { condition: 0, name: "b", value: "x" },
      ]),
    ],
  );

  assert.deepEqual(
    answer.results[0]?.matches.map(({ name, qualifier }) => `${name}/${qualifier ?? ""}`),
    ["a/", "b/", "b/q1", "b/q2"],
  );
});

test("counts the entities in all and by type, the type with the most first and then by name", () => {
  const counts = createEntityQueryCounts([
    createEntity("B_TYPE", "1"),
    createEntity("A_TYPE", "1"),
    createEntity("A_TYPE", "2"),
    createEntity("C_TYPE", "1"),
    createEntity("C_TYPE", "2"),
    createEntity("D_TYPE", "1"),
  ]);

  assert.deepEqual(counts, {
    mode: "count",
    total: 6,
    byType: [
      { type: "A_TYPE", count: 2 },
      { type: "C_TYPE", count: 2 },
      { type: "B_TYPE", count: 1 },
      { type: "D_TYPE", count: 1 },
    ],
  });
});

test("counts already grouped by type give the same answer, in any order they come", () => {
  assert.deepEqual(
    createEntityQueryCountsByType([
      { type: "B_TYPE", count: 1 },
      { type: "A_TYPE", count: 2 },
      { type: "C_TYPE", count: 2 },
    ]),
    {
      mode: "count",
      total: 5,
      byType: [
        { type: "A_TYPE", count: 2 },
        { type: "C_TYPE", count: 2 },
        { type: "B_TYPE", count: 1 },
      ],
    },
  );
  assert.deepEqual(createEntityQueryCountsByType([]), { mode: "count", total: 0, byType: [] });
});

test("counts nothing as zero in all and no types", () => {
  assert.deepEqual(createEntityQueryCounts([]), { mode: "count", total: 0, byType: [] });
});
