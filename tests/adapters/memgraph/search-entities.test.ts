import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  MemgraphConnection,
  RunOptions,
} from "../../../src/adapters/memgraph/memgraph-connection.ts";
import { searchEntities } from "../../../src/adapters/memgraph/search-entities.ts";
import {
  DEFAULT_QUERY_TIMEOUT_MS,
  InvalidSearchError,
  QueryTimeoutError,
} from "../../../src/core/ports/graph-repository/index.ts";

// What is decided here (which queries are asked and with what, the limit shared by them) can be checked
// without a database: the fake connection answers by the kind of query and records what it was asked.
type Answer = Record<string, unknown>[] | Error;

function fakeConnection(answers: { values?: Answer; attributeOnly?: Answer; matches?: Answer }) {
  const calls: {
    kind: string;
    parameters: Record<string, unknown>;
    options?: RunOptions;
  }[] = [];
  const connection = {
    run: async (query: string, parameters: Record<string, unknown> = {}, options?: RunOptions) => {
      const kind = query.includes("UNWIND $keys")
        ? "matches"
        : query.includes("none(")
          ? "attributeOnly"
          : "values";
      calls.push({ kind, parameters, ...(options !== undefined && { options }) });
      const answer = answers[kind] ?? [];
      if (answer instanceof Error) throw answer;
      return answer;
    },
  } as unknown as MemgraphConnection;

  return { connection, calls };
}

const host = (value: string) => ({ type: "HOST", value });
const kinds = (calls: { kind: string }[]) => calls.map(({ kind }) => kind);

test("with the scope entity-value only the entities whose value matches are asked for", async () => {
  const { connection, calls } = fakeConnection({ values: [host("a-x")] });

  const page = await searchEntities(connection, "x", { scope: "entity-value" });

  assert.deepEqual(kinds(calls), ["values"]);
  assert.deepEqual(
    page.results.map(({ entity }) => entity.value),
    ["a-x"],
  );
});

test("asks for the entities up to the end of the page and one more, with the variants of the text", async () => {
  const { connection, calls } = fakeConnection({});

  await searchEntities(connection, "Café", { limit: 10, offset: 0 });

  assert.equal(calls[0]?.parameters["limit"], 11);
  assert.deepEqual([...(calls[0]?.parameters["variants"] as string[])].sort(), ["cafÉ", "café"]);
});

test("does not ask for the attribute-only entities when the first group fills the page", async () => {
  const { connection, calls } = fakeConnection({
    values: [host("a"), host("b"), host("c")],
  });

  const page = await searchEntities(connection, "x", { limit: 2 });

  assert.deepEqual(kinds(calls), ["values", "matches"]);
  assert.equal(page.truncated, true);
  assert.equal(page.nextOffset, 2);
});

test("asks for the attribute-only entities to fill what the first group left, and for the matches of the page", async () => {
  const { connection, calls } = fakeConnection({
    values: [host("a")],
    attributeOnly: [host("b"), host("c")],
    matches: [{ ...host("b"), name: "banner", qualifierKey: "sfp_banner", matched: "has x" }],
  });

  const page = await searchEntities(connection, "x", { limit: 5 });
  await searchEntities(connection, "x", { limit: 5, offset: 2 }).catch(() => undefined);

  assert.deepEqual(kinds(calls).slice(0, 3), ["values", "attributeOnly", "matches"]);
  assert.equal(calls[1]?.parameters["limit"], 5);
  // The entities of the page after the offset need the second group to reach as far as the end of the page.
  assert.equal(calls.findLast(({ kind }) => kind === "attributeOnly")?.parameters["limit"], 7);
  assert.deepEqual(calls[2]?.parameters["keys"], [host("a"), host("b"), host("c")]);
  assert.deepEqual(
    page.results.map(({ entity }) => entity.value),
    ["a", "b", "c"],
  );
  assert.deepEqual(page.results[1]?.matches, [
    { where: "attribute", name: "banner", qualifier: "sfp_banner", snippet: "has x" },
  ]);
});

test("an attribute without a qualifier has no qualifier in the match", async () => {
  const { connection } = fakeConnection({
    attributeOnly: [host("b")],
    matches: [{ ...host("b"), name: "banner", qualifierKey: "", matched: "x" }],
  });

  const page = await searchEntities(connection, "x");

  assert.equal("qualifier" in (page.results[0]?.matches[0] ?? {}), false);
});

test("only the entities of the page are asked about in the attributes, not the ones before it", async () => {
  const { connection, calls } = fakeConnection({
    values: [host("a"), host("b"), host("c"), host("d")],
  });

  await searchEntities(connection, "x", { limit: 2, offset: 1 });

  assert.deepEqual(calls[1]?.parameters["keys"], [host("b"), host("c")]);
});

test("a search that finds nothing is an empty page and asks for no matches", async () => {
  const { connection, calls } = fakeConnection({});

  const page = await searchEntities(connection, "x");

  assert.deepEqual(page.results, []);
  assert.deepEqual(kinds(calls), ["values", "attributeOnly"]);
});

test("an offset past the end is refused", async () => {
  const { connection } = fakeConnection({ values: [host("a")] });

  await assert.rejects(searchEntities(connection, "x", { offset: 3 }), InvalidSearchError);
});

test("refuses a text or an option that makes no sense before asking anything", async () => {
  const { connection, calls } = fakeConnection({});

  await assert.rejects(searchEntities(connection, "  "), InvalidSearchError);
  await assert.rejects(searchEntities(connection, "x", { limit: 0 }), InvalidSearchError);
  assert.equal(calls.length, 0);
});

test("every query is given what is left of the default time limit", async () => {
  const { connection, calls } = fakeConnection({ values: [host("a")] });

  await searchEntities(connection, "x");

  for (const { options } of calls) {
    assert.ok((options?.timeoutMs ?? 0) > DEFAULT_QUERY_TIMEOUT_MS - 1000);
    assert.ok((options?.timeoutMs ?? Infinity) <= DEFAULT_QUERY_TIMEOUT_MS);
  }
});

test("a timeout in any query names the whole limit, not what was left", async () => {
  const { connection } = fakeConnection({ values: new QueryTimeoutError(7) });

  await assert.rejects(
    searchEntities(connection, "x", { timeoutMs: 5000 }),
    (error: unknown) => error instanceof QueryTimeoutError && error.timeoutMs === 5000,
  );
});
