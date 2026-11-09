import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_SEARCH_MAX_MATCHES,
  DEFAULT_SEARCH_SNIPPET_LENGTH,
  InvalidSearchError,
  resolveSearch,
} from "../../../../src/core/ports/graph-repository/index.ts";

test("fills in every default when only the text is given", () => {
  assert.deepEqual(resolveSearch("example"), {
    text: "example",
    scope: "full",
    match: "insensitive",
    limit: DEFAULT_SEARCH_LIMIT,
    offset: 0,
    maxMatches: DEFAULT_SEARCH_MAX_MATCHES,
    snippetLength: DEFAULT_SEARCH_SNIPPET_LENGTH,
  });
  assert.deepEqual(
    [DEFAULT_SEARCH_LIMIT, DEFAULT_SEARCH_MAX_MATCHES, DEFAULT_SEARCH_SNIPPET_LENGTH],
    [50, 100, 200],
  );
});

test("takes every value of the request, with no upper limit", () => {
  assert.deepEqual(
    resolveSearch("x", {
      scope: "entity-value",
      match: "exact",
      limit: 1_000_000,
      offset: 5_000,
      maxMatches: 10_000,
      snippetLength: 100_000,
    }),
    {
      text: "x",
      scope: "entity-value",
      match: "exact",
      limit: 1_000_000,
      offset: 5_000,
      maxMatches: 10_000,
      snippetLength: 100_000,
    },
  );
});

test("a text of one character is valid", () => {
  assert.equal(resolveSearch("a").text, "a");
});

test("cleans the text like an entity value: Unicode NFC and trim", () => {
  assert.equal(resolveSearch("  é ").text, "é");
});

for (const text of ["", "   ", "\n\t"]) {
  test(`refuses the text ${JSON.stringify(text)}`, () => {
    assert.throws(
      () => resolveSearch(text),
      (error: unknown) =>
        error instanceof InvalidSearchError && /at least one character/.test(error.message),
    );
  });
}

test("refuses a scope that does not exist", () => {
  assert.throws(
    () => resolveSearch("x", { scope: "everything" as never }),
    (error: unknown) =>
      error instanceof InvalidSearchError && /scope must be one of/.test(error.message),
  );
});

test("refuses a match mode that does not exist", () => {
  assert.throws(
    () => resolveSearch("x", { match: "fuzzy" as never }),
    (error: unknown) =>
      error instanceof InvalidSearchError &&
      /match must be one of exact, contains, insensitive/.test(error.message),
  );
});

for (const invalid of [
  { limit: 0 },
  { limit: 1.5 },
  { maxMatches: 0 },
  { snippetLength: 0 },
  { snippetLength: -3 },
  { offset: -1 },
  { offset: 1.5 },
  { limit: Number.NaN },
]) {
  test(`refuses ${JSON.stringify(invalid)}`, () => {
    assert.throws(() => resolveSearch("x", invalid), InvalidSearchError);
  });
}

test("an offset of zero is valid", () => {
  assert.equal(resolveSearch("x", { offset: 0 }).offset, 0);
});
