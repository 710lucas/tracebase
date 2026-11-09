import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ENTITY_QUERY_LIMIT,
  DEFAULT_ENTITY_QUERY_SNIPPET_LENGTH,
  InvalidEntityQueryError,
  resolveEntityQuery,
  type EntityQuery,
} from "../../../../src/core/ports/graph-repository/index.ts";

function refusing(query: EntityQuery, reason: RegExp) {
  assert.throws(
    () => resolveEntityQuery(query),
    (error: unknown) => error instanceof InvalidEntityQueryError && reason.test(error.message),
  );
}

test("a query with nothing in it is the whole graph, with every default filled in", () => {
  assert.deepEqual(resolveEntityQuery(), {
    attributes: [],
    includeHistory: false,
    mode: "list",
    limit: DEFAULT_ENTITY_QUERY_LIMIT,
    offset: 0,
    snippetLength: DEFAULT_ENTITY_QUERY_SNIPPET_LENGTH,
  });
  assert.deepEqual(resolveEntityQuery({}), resolveEntityQuery());
  assert.deepEqual([DEFAULT_ENTITY_QUERY_LIMIT, DEFAULT_ENTITY_QUERY_SNIPPET_LENGTH], [50, 200]);
});

test("takes every field of the request, with no upper limit", () => {
  assert.deepEqual(
    resolveEntityQuery({
      types: ["INTERNET_NAME", "IP_ADDRESS"],
      value: { text: "google", match: "contains" },
      attributes: [{ name: "BANNER", qualifier: "sfp_web", text: "nginx", match: "exact" }],
      provenance: { tool: "spiderfoot", module: "sfp_dns", run: "scan-1" },
      includeHistory: true,
      mode: "count",
      limit: 1_000_000,
      offset: 5_000,
      snippetLength: 100_000,
    }),
    {
      types: ["INTERNET_NAME", "IP_ADDRESS"],
      value: { text: "google", match: "contains" },
      attributes: [{ name: "BANNER", qualifier: "sfp_web", text: "nginx", match: "exact" }],
      provenance: { tool: "spiderfoot", module: "sfp_dns", run: "scan-1" },
      includeHistory: true,
      mode: "count",
      limit: 1_000_000,
      offset: 5_000,
      snippetLength: 100_000,
    },
  );
});

test("the match of every text condition defaults to insensitive, each one on its own", () => {
  const resolved = resolveEntityQuery({
    value: { text: "a" },
    attributes: [
      { name: "x", text: "b" },
      { name: "y", text: "c", match: "exact" },
    ],
  });

  assert.equal(resolved.value?.match, "insensitive");
  assert.deepEqual(
    resolved.attributes.map(({ match }) => match),
    ["insensitive", "exact"],
  );
});

test("an attribute condition may have only the name, and then has no text and no qualifier", () => {
  const [condition] = resolveEntityQuery({ attributes: [{ name: "BANNER" }] }).attributes;

  assert.deepEqual(condition, { name: "BANNER", match: "insensitive" });
});

test("a provenance filter keeps only what was given", () => {
  assert.deepEqual(resolveEntityQuery({ provenance: { module: "sfp_dns" } }).provenance, {
    module: "sfp_dns",
  });
});

test("cleans the texts like an entity: Unicode NFC and trim", () => {
  const resolved = resolveEntityQuery({
    types: [" DOMAIN_NAME "],
    value: { text: "  café " },
    attributes: [{ name: " BANNER ", qualifier: " q ", text: " x " }],
    provenance: { tool: " spiderfoot ", module: " m ", run: " r " },
  });

  assert.deepEqual(resolved.types, ["DOMAIN_NAME"]);
  assert.equal(resolved.value?.text, "café");
  assert.deepEqual(resolved.attributes[0], {
    name: "BANNER",
    qualifier: "q",
    text: "x",
    match: "insensitive",
  });
  assert.deepEqual(resolved.provenance, { tool: "spiderfoot", module: "m", run: "r" });
});

test("a field that was not asked is not in the result", () => {
  const resolved = resolveEntityQuery({ mode: "count" });

  assert.equal("types" in resolved, false);
  assert.equal("value" in resolved, false);
  assert.equal("provenance" in resolved, false);
});

test("refuses an empty list of types and a blank type", () => {
  refusing({ types: [] }, /types must have at least one type/);
  refusing({ types: ["A", "  "] }, /a type must have at least one character/);
});

test("refuses a value condition with a blank text", () => {
  refusing({ value: { text: "" } }, /the text of the value must have at least one character/);
  refusing({ value: { text: "  " } }, /the text of the value/);
});

test("refuses an attribute condition without a name, or with a blank qualifier or text", () => {
  refusing({ attributes: [{ name: "" }] }, /the name of an attribute must have/);
  refusing({ attributes: [{ name: "x", qualifier: " " }] }, /the qualifier of an attribute/);
  refusing({ attributes: [{ name: "x", text: "" }] }, /the text of an attribute/);
});

test("refuses a provenance filter with nothing in it, or with a blank part", () => {
  refusing({ provenance: {} }, /provenance needs at least one of tool, module and run/);
  refusing({ provenance: { tool: " " } }, /the tool of the provenance/);
  refusing({ provenance: { module: "" } }, /the module of the provenance/);
  refusing({ provenance: { run: "" } }, /the run of the provenance/);
});

test("refuses a match or a mode that does not exist", () => {
  refusing({ value: { text: "x", match: "fuzzy" as never } }, /match must be one of/);
  refusing({ attributes: [{ name: "x", match: "fuzzy" as never }] }, /match must be one of/);
  refusing({ mode: "table" as never }, /mode must be one of list, count/);
});

for (const invalid of [{ snippetLength: 0 }, { snippetLength: 2.5 }, { snippetLength: -1 }]) {
  test(`refuses ${JSON.stringify(invalid)}`, () => {
    refusing(invalid, /snippetLength must be a whole number from 1/);
  });
}

for (const invalid of [{ limit: 0 }, { limit: 1.5 }, { limit: -1 }, { limit: Number.NaN }]) {
  test(`refuses ${JSON.stringify(invalid)}`, () => {
    refusing(invalid, /limit must be a whole number from 1/);
  });
}

for (const invalid of [{ offset: -1 }, { offset: 1.5 }, { offset: Number.NaN }]) {
  test(`refuses ${JSON.stringify(invalid)}`, () => {
    refusing(invalid, /offset must be a whole number from 0/);
  });
}

test("an offset of 0 and a limit of 1 are valid", () => {
  const resolved = resolveEntityQuery({ limit: 1, offset: 0 });

  assert.deepEqual([resolved.limit, resolved.offset], [1, 0]);
});
