import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, textOf, type TestApp } from "./start-test-app.ts";

// The tools that find things: `find_shortest_path`, `search_entities` and `query_entities`, called by a real
// MCP client over HTTP. Every tool also refuses a field it does not have.
let app: TestApp;

before(async () => {
  app = await startTestApp();
});

after(async () => {
  await app.stop();
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const client = await app.connect();
  try {
    return await client.callTool({ name, arguments: args });
  } finally {
    await client.close();
  }
}

const json = (result: Awaited<ReturnType<typeof call>>) => JSON.parse(textOf(result));

const b = { type: "INTERNET_NAME", value: "b.example.com" };
const a = { type: "INTERNET_NAME", value: "a.example.com" };

test("the three tools are listed", async () => {
  const client = await app.connect();

  const { tools } = await client.listTools();

  for (const name of ["find_shortest_path", "search_entities", "query_entities"]) {
    assert.ok(
      tools.some((tool) => tool.name === name),
      name,
    );
  }
  await client.close();
});

test("find_shortest_path gives the entities of the path and every relation of each step", async () => {
  const result = await call("find_shortest_path", { from: b, to: a });
  const path = json(result) as {
    maxHops: number;
    entities: { value: string }[];
    steps: { relations: { provenance: { tool: string } }[] }[];
  };

  assert.notEqual(result.isError, true);
  assert.equal(path.maxHops, 6);
  assert.deepEqual(
    path.entities.map(({ value }) => value),
    ["b.example.com", "10.0.0.1", "a.example.com"],
  );
  assert.equal(path.steps.length, 2);
  assert.equal(path.steps[0]?.relations[0]?.provenance.tool, "spiderfoot");
});

test("find_shortest_path with too few hops is an empty path, not an error", async () => {
  const result = await call("find_shortest_path", { from: b, to: a, maxHops: 1 });

  assert.notEqual(result.isError, true);
  assert.deepEqual(json(result).entities, []);
});

test("find_shortest_path says which end is not in the graph", async () => {
  const missing = { type: "INTERNET_NAME", value: "nobody.example.com" };
  const noEnd = await call("find_shortest_path", { from: b, to: missing });
  const noStart = await call("find_shortest_path", { from: missing, to: a });
  const neither = await call("find_shortest_path", {
    from: missing,
    to: { type: "INTERNET_NAME", value: "nobody-2.example.com" },
  });

  assert.equal(noEnd.isError, true);
  assert.equal(textOf(noEnd), "Not in the graph: the end (INTERNET_NAME nobody.example.com).");
  assert.match(
    textOf(noStart),
    /^Not in the graph: the start \(INTERNET_NAME nobody\.example\.com\)\.$/,
  );
  assert.match(textOf(neither), /the start .* and the end/);
});

test("find_shortest_path refuses a maxHops that makes no sense", async () => {
  const result = await call("find_shortest_path", { from: b, to: a, maxHops: 0 });

  assert.equal(result.isError, true);
  assert.match(textOf(result), /maxHops/);
});

test("search_entities finds by value first and then by attribute, with where it matched", async () => {
  const result = await call("search_entities", { text: "EXAMPLE.com" });
  const page = json(result) as {
    match: string;
    results: { entity: { value: string }; matches: { where: string; snippet: string }[] }[];
    truncated: boolean;
  };

  assert.notEqual(result.isError, true);
  assert.equal(page.match, "insensitive");
  assert.deepEqual(
    page.results.map(({ entity }) => entity.value),
    ["a.example.com", "b.example.com", "10.0.0.1"],
  );
  assert.equal(page.results[0]?.matches[0]?.where, "entity-value");
  assert.deepEqual(page.results[2]?.matches[0], {
    where: "attribute",
    name: "WEBSERVER_BANNER",
    qualifier: "sfp_webserver",
    snippet: "nginx/1.25 for example.com",
  });
  assert.equal(page.truncated, false);
});

test("search_entities takes the match mode and the scope of the call", async () => {
  const exact = json(await call("search_entities", { text: "a.example.com", match: "exact" }));
  const contains = json(await call("search_entities", { text: "A.EXAMPLE", match: "contains" }));
  const valueOnly = json(await call("search_entities", { text: "nginx", scope: "entity-value" }));

  assert.deepEqual(
    exact.results.map(({ entity }: { entity: { value: string } }) => entity.value),
    ["a.example.com"],
  );
  assert.deepEqual(contains.results, []);
  assert.deepEqual(valueOnly.results, []);
});

test("search_entities reads by pages and says in its own words how to go on", async () => {
  const first = json(await call("search_entities", { text: "example", limit: 2 }));
  const second = json(
    await call("search_entities", { text: "example", limit: 2, offset: first.nextOffset }),
  );

  assert.equal(first.truncated, true);
  assert.equal(first.nextOffset, 2);
  assert.match(first.hint, /call again with offset=2/);
  assert.equal(second.results.length, 1);
  assert.equal("hint" in second, false);
});

test("search_entities refuses a text without a character and an offset past the end", async () => {
  const blank = await call("search_entities", { text: "  " });
  const pastTheEnd = await call("search_entities", { text: "example", offset: 99 });

  assert.equal(blank.isError, true);
  assert.match(textOf(blank), /at least one character/);
  assert.equal(pastTheEnd.isError, true);
  assert.match(textOf(pastTheEnd), /past the end/);
});

test("query_entities counts by type with no condition", async () => {
  const result = await call("query_entities", { mode: "count" });

  assert.notEqual(result.isError, true);
  assert.deepEqual(json(result), {
    mode: "count",
    total: 3,
    byType: [
      { type: "INTERNET_NAME", count: 2 },
      { type: "IP_ADDRESS", count: 1 },
    ],
  });
});

test("query_entities lists with the snippet where an attribute condition matched", async () => {
  const result = await call("query_entities", {
    attributes: [{ name: "WEBSERVER_BANNER", text: "NGINX" }],
  });
  const page = json(result);

  assert.notEqual(result.isError, true);
  assert.equal(page.mode, "list");
  assert.deepEqual(page.results, [
    {
      entity: { type: "IP_ADDRESS", value: "10.0.0.1" },
      matches: [
        {
          name: "WEBSERVER_BANNER",
          qualifier: "sfp_webserver",
          snippet: "nginx/1.25 for example.com",
        },
      ],
    },
  ]);
});

test("query_entities filters by type, by value and by who saw it", async () => {
  const typed = json(
    await call("query_entities", { types: ["INTERNET_NAME"], value: { text: "B." } }),
  );
  const seen = json(
    await call("query_entities", { provenance: { module: "sfp_dns" }, mode: "count" }),
  );

  assert.deepEqual(
    typed.results.map(({ entity }: { entity: { value: string } }) => entity.value),
    ["b.example.com"],
  );
  assert.equal(seen.total, 2);
});

test("query_entities reads by pages and says in its own words how to go on", async () => {
  const first = json(await call("query_entities", { limit: 2 }));

  assert.equal(first.truncated, true);
  assert.match(first.hint, /call again with offset=2/);
});

test("query_entities accepts includeHistory, and says what is wrong with a query that makes no sense", async () => {
  const withHistory = await call("query_entities", {
    attributes: [{ name: "WEBSERVER_BANNER", text: "nginx" }],
    includeHistory: true,
    mode: "count",
  });
  const emptyTypes = await call("query_entities", { types: [] });
  const blankText = await call("query_entities", { value: { text: " " } });
  const nothingToSee = await call("query_entities", { provenance: {} });

  assert.equal(json(withHistory).total, 1);
  assert.equal(emptyTypes.isError, true);
  assert.match(textOf(emptyTypes), /types must have at least one type/);
  assert.equal(blankText.isError, true);
  assert.match(textOf(blankText), /the text of the value/);
  assert.equal(nothingToSee.isError, true);
  assert.match(textOf(nothingToSee), /provenance needs at least one/);
});

test("every tool refuses a field it does not have, so a typo is not lost", async () => {
  const entity = { type: "IP_ADDRESS", value: "10.0.0.1" };
  for (const [name, args] of [
    ["list_entity_types", {}],
    ["find_entity", entity],
    ["get_entity_degree", entity],
    ["get_entity_neighbourhood", entity],
    ["find_shortest_path", { from: b, to: a }],
    ["search_entities", { text: "example" }],
    ["query_entities", {}],
  ] as const) {
    const result = await call(name, { ...args, includeHistroy: true });

    assert.equal(result.isError, true, name);
    assert.match(textOf(result), /includeHistroy|Unrecognized/, name);
  }
});

test("a wrong type of value is refused by the protocol layer", async () => {
  const result = await call("query_entities", { limit: "5" });

  assert.equal(result.isError, true);
});
