import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEntityQueryConditions } from "../../../src/adapters/memgraph/entity-query-conditions.ts";
import {
  resolveEntityQuery,
  type EntityQuery,
} from "../../../src/core/ports/graph-repository/index.ts";

// What is decided here (which conditions, with which parameters) can be checked without a database; that the
// text means what it should is checked by the contract suite against a running Memgraph.
function build(query: EntityQuery) {
  return buildEntityQueryConditions(resolveEntityQuery(query));
}

test("a query with no condition is the whole graph: nothing to add to MATCH", () => {
  assert.deepEqual(build({}), { conditions: [], parameters: {} });
});

test("the types are alternatives of one condition", () => {
  const { conditions, parameters } = build({ types: ["A", "B"] });

  assert.deepEqual(conditions, ["n.type IN $types"]);
  assert.deepEqual(parameters, { types: ["A", "B"] });
});

test("the value condition uses the match mode, with its own parameter names", () => {
  const exact = build({ value: { text: "x", match: "exact" } });
  const contains = build({ value: { text: "x", match: "contains" } });
  const insensitive = build({ value: { text: "x" } });

  assert.deepEqual(exact, { conditions: ["n.value = $valueText"], parameters: { valueText: "x" } });
  assert.deepEqual(contains.conditions, ["n.value CONTAINS $valueText"]);
  assert.deepEqual(insensitive.conditions, ["n.value =~ $valuePattern"]);
  assert.deepEqual(Object.keys(insensitive.parameters), ["valuePattern"]);
});

test("an attribute condition with only a name looks at the current sets by name", () => {
  const { conditions, parameters } = build({ attributes: [{ name: "banner" }] });

  assert.equal(conditions.length, 1);
  assert.match(conditions[0] ?? "", /n\.attributes IS NOT NULL/);
  assert.match(conditions[0] ?? "", /name = \$attribute0Name/);
  assert.doesNotMatch(conditions[0] ?? "", /candidate|HAS_ATTRIBUTE|\$attribute0Qualifier/);
  assert.deepEqual(parameters, { attribute0Name: "banner" });
});

test("the qualifier and the text of an attribute condition narrow it", () => {
  const { conditions, parameters } = build({
    attributes: [{ name: "banner", qualifier: "sfp_web", text: "nginx", match: "contains" }],
  });

  assert.match(conditions[0] ?? "", /qualifier = \$attribute0Qualifier/);
  assert.match(
    conditions[0] ?? "",
    /any\(candidate IN n\.attributes\[name\]\[qualifier\]\.values WHERE candidate CONTAINS \$attribute0Text\)/,
  );
  assert.deepEqual(parameters, {
    attribute0Name: "banner",
    attribute0Qualifier: "sfp_web",
    attribute0Text: "nginx",
  });
});

test("each attribute condition has its own parameters, so they do not clash", () => {
  const { conditions, parameters } = build({
    attributes: [
      { name: "a", text: "x" },
      { name: "b", text: "y" },
    ],
  });

  assert.equal(conditions.length, 2);
  assert.deepEqual(Object.keys(parameters).sort(), [
    "attribute0Name",
    "attribute0Pattern",
    "attribute1Name",
    "attribute1Pattern",
  ]);
  assert.equal(parameters["attribute0Name"], "a");
  assert.equal(parameters["attribute1Name"], "b");
});

test("includeHistory makes an attribute condition also look at the replaced sets", () => {
  const withoutHistory = build({ attributes: [{ name: "banner", text: "x" }] });
  const withHistory = build({
    attributes: [{ name: "banner", qualifier: "q", text: "x" }],
    includeHistory: true,
  });

  assert.doesNotMatch(withoutHistory.conditions[0] ?? "", /HAS_ATTRIBUTE/);
  assert.match(
    withHistory.conditions[0] ?? "",
    / OR EXISTS \{ MATCH \(n\)-\[:HAS_ATTRIBUTE\]->\(h:Attribute\)/,
  );
  assert.match(
    withHistory.conditions[0] ?? "",
    /h\.name = \$attribute0Name AND h\.qualifier = \$attribute0Qualifier/,
  );
  assert.match(withHistory.conditions[0] ?? "", /any\(candidate IN h\.values WHERE/);
});

test("a provenance filter is asked of the edges and of the current sets, every part on the same record", () => {
  const { conditions, parameters } = build({ provenance: { tool: "t", module: "m", run: "r" } });

  assert.equal(conditions.length, 1);
  assert.match(
    conditions[0] ?? "",
    /\(n\)-\[r\]-\(\) WHERE type\(r\) <> "HAS_ATTRIBUTE" AND r\.tool = \$provenanceTool AND r\.module = \$provenanceModule AND r\.run = \$provenanceRun/,
  );
  assert.match(
    conditions[0] ?? "",
    /n\.attributes\[name\]\[qualifier\]\.tool = \$provenanceTool AND n\.attributes\[name\]\[qualifier\]\.module = \$provenanceModule/,
  );
  assert.doesNotMatch(conditions[0] ?? "", /HAS_ATTRIBUTE\]->\(h/);
  assert.deepEqual(parameters, { provenanceTool: "t", provenanceModule: "m", provenanceRun: "r" });
});

test("a provenance filter only checks the parts it has, and with includeHistory also the replaced sets", () => {
  const { conditions, parameters } = build({ provenance: { run: "r" }, includeHistory: true });

  assert.doesNotMatch(conditions[0] ?? "", /provenanceTool|provenanceModule/);
  assert.match(
    conditions[0] ?? "",
    /EXISTS \{ MATCH \(n\)-\[:HAS_ATTRIBUTE\]->\(h:Attribute\) WHERE h\.run = \$provenanceRun \}/,
  );
  assert.deepEqual(parameters, { provenanceRun: "r" });
});

test("all the conditions come together, in order", () => {
  const { conditions } = build({
    types: ["A"],
    value: { text: "x" },
    attributes: [{ name: "b" }],
    provenance: { tool: "t" },
  });

  assert.equal(conditions.length, 4);
  assert.match(conditions[0] ?? "", /^n\.type IN/);
  assert.match(conditions[1] ?? "", /^n\.value/);
  assert.match(conditions[2] ?? "", /name = \$attribute0Name/);
  assert.match(conditions[3] ?? "", /provenanceTool/);
});
