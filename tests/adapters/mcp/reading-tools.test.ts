import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, textOf, type TestApp } from "./start-test-app.ts";

// The tools that read what is in the graph: `list_entity_types`, `find_entity` and `get_entity_neighbourhood`,
// called by a real MCP client over HTTP.
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

test("the three tools are listed", async () => {
  const client = await app.connect();

  const { tools } = await client.listTools();

  for (const name of ["list_entity_types", "find_entity", "get_entity_neighbourhood"]) {
    assert.ok(
      tools.some((tool) => tool.name === name),
      name,
    );
  }
  await client.close();
});

test("list_entity_types takes no input and lists the types with their counts", async () => {
  const result = await call("list_entity_types");

  assert.notEqual(result.isError, true);
  assert.deepEqual(JSON.parse(textOf(result)), {
    types: [
      { type: "INTERNET_NAME", count: 2 },
      { type: "IP_ADDRESS", count: 1 },
    ],
  });
});

test("find_entity gives the relations and the attributes, with provenance", async () => {
  const result = await call("find_entity", { type: "IP_ADDRESS", value: "10.0.0.1" });
  const findings = JSON.parse(textOf(result)) as {
    entity: { value: string };
    relations: { provenance: { tool: string } }[];
    attributes: { name: string; provenance: { tool: string } }[];
  };

  assert.notEqual(result.isError, true);
  assert.equal(findings.entity.value, "10.0.0.1");
  assert.equal(findings.relations.length, 2);
  assert.equal(findings.relations[0]?.provenance.tool, "spiderfoot");
  assert.deepEqual(
    findings.attributes.map(({ name }) => name),
    ["WEBSERVER_BANNER"],
  );
});

test("find_entity normalizes the text and says when the entity is not there", async () => {
  const spaced = await call("find_entity", { type: " IP_ADDRESS ", value: "10.0.0.1 " });
  const missing = await call("find_entity", { type: "IP_ADDRESS", value: "10.9.9.9" });
  const blank = await call("find_entity", { type: "", value: "x" });

  assert.notEqual(spaced.isError, true);
  assert.equal(missing.isError, true);
  assert.equal(
    textOf(missing),
    "No entity of type IP_ADDRESS with value 10.9.9.9 is in the graph.",
  );
  assert.equal(blank.isError, true);
  assert.match(textOf(blank), /type must not be blank/);
});

test("get_entity_neighbourhood is lean by default: the origin with its attributes, the others as type, value and distance", async () => {
  const result = await call("get_entity_neighbourhood", { type: "IP_ADDRESS", value: "10.0.0.1" });
  const answer = JSON.parse(textOf(result)) as {
    origin: { value: string; attributes: { name: string }[] };
    hops: number;
    entities: { value: string; distance: number }[];
    relations: Record<string, unknown>[];
    truncated: boolean;
  };

  assert.notEqual(result.isError, true);
  assert.equal(answer.origin.value, "10.0.0.1");
  assert.deepEqual(
    answer.origin.attributes.map(({ name }) => name),
    ["WEBSERVER_BANNER"],
  );
  assert.equal(answer.hops, 3);
  assert.deepEqual(
    answer.entities.map(({ value, distance }) => [value, distance]),
    [
      ["a.example.com", 1],
      ["b.example.com", 1],
    ],
  );
  assert.equal(answer.relations.length, 2);
  assert.equal("provenance" in (answer.relations[0] ?? {}), false);
  assert.equal(answer.truncated, false);
});

test("detail full gives the provenance of every relation", async () => {
  const result = await call("get_entity_neighbourhood", {
    type: "IP_ADDRESS",
    value: "10.0.0.1",
    detail: "full",
  });
  const answer = JSON.parse(textOf(result)) as { relations: { provenance?: unknown }[] };

  assert.ok(answer.relations.every((relation) => relation.provenance !== undefined));
});

test("the options of the call are used, and a page that is cut says where the next one starts", async () => {
  const first = JSON.parse(
    textOf(
      await call("get_entity_neighbourhood", {
        type: "IP_ADDRESS",
        value: "10.0.0.1",
        hops: 1,
        maxEntities: 2,
      }),
    ),
  ) as { entities: { value: string }[]; truncated: boolean; nextOffset: number; hint: string };
  const second = JSON.parse(
    textOf(
      await call("get_entity_neighbourhood", {
        type: "IP_ADDRESS",
        value: "10.0.0.1",
        hops: 1,
        maxEntities: 2,
        offset: first.nextOffset,
      }),
    ),
  ) as { entities: { value: string }[]; truncated: boolean; hint?: string };

  assert.equal(first.truncated, true);
  assert.equal(first.nextOffset, 2);
  assert.match(first.hint, /call again with offset=2/);
  assert.deepEqual(
    [...first.entities, ...second.entities].map(({ value }) => value),
    ["a.example.com", "b.example.com"],
  );
  assert.equal(second.truncated, false);
  assert.equal("hint" in second, false);
});

test("get_entity_neighbourhood says when the entity is not there, and when an option makes no sense", async () => {
  const missing = await call("get_entity_neighbourhood", { type: "IP_ADDRESS", value: "10.9.9.9" });
  const badHops = await call("get_entity_neighbourhood", {
    type: "IP_ADDRESS",
    value: "10.0.0.1",
    hops: 0,
  });
  const pastTheEnd = await call("get_entity_neighbourhood", {
    type: "IP_ADDRESS",
    value: "10.0.0.1",
    offset: 99,
  });

  assert.equal(missing.isError, true);
  assert.match(textOf(missing), /No entity of type IP_ADDRESS/);
  assert.equal(badHops.isError, true);
  assert.match(textOf(badHops), /hops/);
  assert.equal(pastTheEnd.isError, true);
  assert.match(textOf(pastTheEnd), /offset/);
});

test("a detail that does not exist is refused by the protocol layer", async () => {
  const result = await call("get_entity_neighbourhood", {
    type: "IP_ADDRESS",
    value: "10.0.0.1",
    detail: "huge",
  });

  assert.equal(result.isError, true);
});
