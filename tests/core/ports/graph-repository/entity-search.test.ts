import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntity } from "../../../../src/core/domain/entity/index.ts";
import {
  createEntitySearchPage,
  InvalidSearchError,
  resolveSearch,
  type FoundEntity,
  type SearchOptions,
} from "../../../../src/core/ports/graph-repository/index.ts";

const onValue = (value: string) => ({ where: "entity-value" as const, value });
const onAttribute = (name: string, value: string, qualifier?: string) => ({
  where: "attribute" as const,
  name,
  ...(qualifier !== undefined && { qualifier }),
  value,
});

function page(found: FoundEntity[], options: SearchOptions = {}, text = "needle") {
  return createEntitySearchPage({ search: resolveSearch(text, options), found });
}

function names(result: ReturnType<typeof page>): string[] {
  return result.results.map(({ entity }) => `${entity.type}:${entity.value}`);
}

const hostB = { entity: createEntity("HOST", "b-needle"), matches: [onValue("b-needle")] };
const hostA = { entity: createEntity("HOST", "a-needle"), matches: [onValue("a-needle")] };
const emailA = { entity: createEntity("EMAIL", "a-needle"), matches: [onValue("a-needle")] };
const onlyAttribute = {
  entity: createEntity("HOST", "0-first-by-value"),
  matches: [onAttribute("banner", "a needle in a banner")],
};

test("the entities whose value matches come first, then the ones that only match in an attribute", () => {
  const result = page([onlyAttribute, hostB, hostA]);

  assert.deepEqual(names(result), ["HOST:a-needle", "HOST:b-needle", "HOST:0-first-by-value"]);
});

test("inside a group the order is by value and then by type", () => {
  assert.deepEqual(names(page([hostB, emailA, hostA])), [
    "EMAIL:a-needle",
    "HOST:a-needle",
    "HOST:b-needle",
  ]);
});

test("an entity that matches in its value and in an attribute is one result, in the first group", () => {
  const both = {
    entity: createEntity("HOST", "z-needle"),
    matches: [onAttribute("banner", "a needle"), onValue("z-needle")],
  };

  const result = page([onlyAttribute, both]);

  assert.deepEqual(names(result), ["HOST:z-needle", "HOST:0-first-by-value"]);
  assert.deepEqual(
    result.results[0]?.matches.map(({ where, name }) => [where, name]),
    [
      ["entity-value", undefined],
      ["attribute", "banner"],
    ],
  );
});

test("the attributes of an entity are listed by name and then by qualifier, an absent qualifier first", () => {
  const entity = {
    entity: createEntity("HOST", "h"),
    matches: [
      onAttribute("b", "needle", "q2"),
      onAttribute("b", "needle", "q1"),
      onAttribute("b", "needle"),
      onAttribute("a", "needle"),
    ],
  };

  const matches = page([entity]).results[0]?.matches ?? [];

  assert.deepEqual(
    matches.map(({ name, qualifier }) => `${name}/${qualifier ?? "-"}`),
    ["a/-", "b/-", "b/q1", "b/q2"],
  );
});

test("each match carries a snippet of its value, of the length asked", () => {
  const long = `${"x".repeat(50)}needle${"y".repeat(50)}`;
  const entity = { entity: createEntity("HOST", "h"), matches: [onAttribute("note", long)] };

  const [match] = page([entity], { snippetLength: 20 }).results[0]?.matches ?? [];

  assert.equal(match?.snippet, `…${"x".repeat(7)}needle${"y".repeat(7)}…`);
  assert.equal(match?.name, "note");
  assert.equal("qualifier" in (match ?? {}), false);
});

test("the matches of an entity are cut at maxMatches and the rest is counted", () => {
  const entity = {
    entity: createEntity("HOST", "h"),
    matches: ["a", "b", "c", "d", "e"].map((name) => onAttribute(name, "needle")),
  };

  const cut = page([entity], { maxMatches: 3 }).results[0];
  const whole = page([entity], { maxMatches: 5 }).results[0];

  assert.deepEqual(
    cut?.matches.map(({ name }) => name),
    ["a", "b", "c"],
  );
  assert.equal(cut?.moreMatches, 2);
  assert.equal(whole?.matches.length, 5);
  assert.equal("moreMatches" in (whole ?? {}), false);
});

test("a page is a slice of the ordered results and says where the next one starts", () => {
  const found = [hostB, emailA, hostA];

  const first = page(found, { limit: 2 });
  const second = page(found, { limit: 2, offset: 2 });

  assert.deepEqual(names(first), ["EMAIL:a-needle", "HOST:a-needle"]);
  assert.equal(first.truncated, true);
  assert.equal(first.nextOffset, 2);
  assert.deepEqual(names(second), ["HOST:b-needle"]);
  assert.equal(second.truncated, false);
  assert.equal("nextOffset" in second, false);
});

test("a search that finds nothing is an empty page, not an error", () => {
  const result = page([]);

  assert.deepEqual(result.results, []);
  assert.equal(result.truncated, false);
});

test("an offset past the end of the results is refused", () => {
  assert.throws(
    () => page([hostA, hostB], { offset: 2 }),
    (error: unknown) => error instanceof InvalidSearchError && /past the end/.test(error.message),
  );
  assert.throws(() => page([], { offset: 1 }), InvalidSearchError);
});

test("the page repeats what was asked, with the defaults filled in", () => {
  const result = page([hostA], {}, "  Needle ");

  assert.deepEqual(
    [
      result.text,
      result.scope,
      result.limit,
      result.offset,
      result.maxMatches,
      result.snippetLength,
    ],
    ["Needle", "full", 50, 0, 100, 200],
  );
});
