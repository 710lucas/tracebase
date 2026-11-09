import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  MemgraphConnection,
  RunOptions,
} from "../../../src/adapters/memgraph/memgraph-connection.ts";
import { queryEntities } from "../../../src/adapters/memgraph/query-entities.ts";
import {
  InvalidEntityQueryError,
  QueryTimeoutError,
  type EntityQueryPage,
} from "../../../src/core/ports/graph-repository/index.ts";

// What is decided here (which queries are asked, with what, the limit shared by them) can be checked without a
// database: the fake connection answers by the kind of query and records what it was asked.
type Answer = Record<string, unknown>[] | Error;

function fakeConnection(answers: {
  entities?: Answer;
  counts?: Answer;
  current?: Answer;
  history?: Answer;
}) {
  const calls: {
    kind: string;
    query: string;
    parameters: Record<string, unknown>;
    options?: RunOptions;
  }[] = [];
  const connection = {
    run: async (query: string, parameters: Record<string, unknown> = {}, options?: RunOptions) => {
      const kind = query.includes("UNWIND $keys")
        ? query.includes("(h:Attribute) WHERE h.name")
          ? "history"
          : "current"
        : query.includes("count(n)")
          ? "counts"
          : "entities";
      calls.push({ kind, query, parameters, ...(options !== undefined && { options }) });
      const answer = answers[kind] ?? [];
      if (answer instanceof Error) throw answer;
      return answer;
    },
  } as unknown as MemgraphConnection;

  return { connection, calls };
}

const host = (value: string) => ({ type: "HOST", value });
const kinds = (calls: { kind: string }[]) => calls.map(({ kind }) => kind);

test("the mode count is one query that counts by type, and the answer is made from its rows", async () => {
  const { connection, calls } = fakeConnection({
    counts: [
      { type: "B", count: 1 },
      { type: "A", count: 3 },
    ],
  });

  const answer = await queryEntities(connection, { mode: "count", limit: 1, offset: 9 });

  assert.deepEqual(kinds(calls), ["counts"]);
  assert.deepEqual(answer, {
    mode: "count",
    total: 4,
    byType: [
      { type: "A", count: 3 },
      { type: "B", count: 1 },
    ],
  });
});

test("a query with no condition has no WHERE, and asks for the entities up to the end of the page and one more", async () => {
  const { connection, calls } = fakeConnection({ entities: [host("a"), host("b")] });

  await queryEntities(connection, { limit: 10, offset: 1 });

  assert.equal(calls.length, 1);
  assert.match(calls[0]?.query ?? "", /^MATCH \(n:Entity\) RETURN/);
  assert.equal(calls[0]?.parameters["needed"], 12);
});

test("the conditions go into the WHERE with their parameters", async () => {
  const { connection, calls } = fakeConnection({});

  await queryEntities(connection, { types: ["HOST"], value: { text: "x", match: "exact" } });

  assert.match(calls[0]?.query ?? "", /WHERE n\.type IN \$types AND n\.value = \$valueText RETURN/);
  assert.deepEqual(
    [calls[0]?.parameters["types"], calls[0]?.parameters["valueText"]],
    [["HOST"], "x"],
  );
});

test("an attribute condition with a text asks where the entities of the page met it, once for each condition", async () => {
  const { connection, calls } = fakeConnection({
    entities: [host("a"), host("b"), host("c")],
    current: [{ ...host("b"), name: "banner", qualifierKey: "sfp_web", matched: "has x" }],
  });

  const answer = (await queryEntities(connection, {
    limit: 2,
    attributes: [
      { name: "banner", text: "x" },
      { name: "note", text: "y" },
    ],
  })) as EntityQueryPage;

  assert.deepEqual(kinds(calls), ["entities", "current", "current"]);
  assert.deepEqual(calls[1]?.parameters["keys"], [host("a"), host("b")]);
  assert.match(calls[1]?.query ?? "", /name = \$attribute0Name/);
  assert.match(calls[2]?.query ?? "", /name = \$attribute1Name/);
  // The fake answers both queries with the same row, so the entity has one match for each condition.
  assert.deepEqual(answer.results[1]?.matches, [
    { name: "banner", qualifier: "sfp_web", snippet: "has x" },
    { name: "banner", qualifier: "sfp_web", snippet: "has x" },
  ]);
  assert.deepEqual(answer.results[0]?.matches, []);
  assert.equal(answer.truncated, true);
});

test("a condition with only a name asks nothing more", async () => {
  const { connection, calls } = fakeConnection({ entities: [host("a")] });

  await queryEntities(connection, { attributes: [{ name: "banner" }] });

  assert.deepEqual(kinds(calls), ["entities"]);
});

test("a page with no entity asks nothing about the attributes", async () => {
  const { connection, calls } = fakeConnection({ entities: [] });

  await queryEntities(connection, { attributes: [{ name: "banner", text: "x" }] });

  assert.deepEqual(kinds(calls), ["entities"]);
});

test("with includeHistory each condition with a text also asks the replaced sets, and marks what they answer", async () => {
  const { connection, calls } = fakeConnection({
    entities: [host("a")],
    current: [{ ...host("a"), name: "banner", qualifierKey: "", matched: "new x" }],
    history: [{ ...host("a"), name: "banner", qualifierKey: "", matched: "old x" }],
  });

  const answer = (await queryEntities(connection, {
    attributes: [{ name: "banner", text: "x" }],
    includeHistory: true,
  })) as EntityQueryPage;

  assert.deepEqual(kinds(calls), ["entities", "current", "history"]);
  assert.deepEqual(answer.results[0]?.matches, [
    { name: "banner", snippet: "new x" },
    { name: "banner", snippet: "old x", history: true },
  ]);
});

test("without includeHistory the replaced sets are not asked for", async () => {
  const { connection, calls } = fakeConnection({ entities: [host("a")] });

  await queryEntities(connection, { attributes: [{ name: "banner", text: "x" }] });

  assert.equal(kinds(calls).includes("history"), false);
});

test("an offset past the end is refused, whatever the database answered", async () => {
  const { connection } = fakeConnection({ entities: [host("a")] });

  await assert.rejects(
    queryEntities(connection, { offset: 5 }),
    (error: unknown) => error instanceof InvalidEntityQueryError,
  );
});

test("a query that makes no sense is refused before any query is asked", async () => {
  const { connection, calls } = fakeConnection({});

  await assert.rejects(
    queryEntities(connection, { types: [] }),
    (error: unknown) => error instanceof InvalidEntityQueryError,
  );
  assert.equal(calls.length, 0);
});

test("every query gets what is left of the one time limit, and a timeout names the whole limit", async () => {
  const { connection, calls } = fakeConnection({
    entities: [host("a")],
    current: new QueryTimeoutError(1),
  });

  await assert.rejects(
    queryEntities(
      connection,
      { attributes: [{ name: "banner", text: "x" }] },
      { timeoutMs: 5_000 },
    ),
    (error: unknown) => error instanceof QueryTimeoutError && error.timeoutMs === 5_000,
  );
  assert.ok((calls[0]?.options?.timeoutMs ?? 0) <= 5_000);
  assert.ok((calls[1]?.options?.timeoutMs ?? 0) <= (calls[0]?.options?.timeoutMs ?? 0));
});
