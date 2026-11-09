import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  InvalidCypherError,
  type CypherReader,
} from "../../../src/core/ports/cypher-reader/index.ts";
import { QueryTimeoutError } from "../../../src/core/ports/graph-repository/index.ts";
import { startTestApp, textOf, type TestApp } from "./start-test-app.ts";

// `run_read_only_cypher`, called by a real MCP client over HTTP, with a fake `CypherReader` so the test sees what
// the tool passes on and how it answers. What the real reader does is tested in `read-cypher.test.ts`.
const calls: { statement: string; options: unknown }[] = [];
let outcome: () => Promise<unknown> = async () => ({});

const reader: CypherReader = {
  readCypher: async (statement, options) => {
    calls.push({ statement, options });
    return (await outcome()) as Awaited<ReturnType<CypherReader["readCypher"]>>;
  },
};

let app: TestApp;
let appWithoutCypher: TestApp;

before(async () => {
  app = await startTestApp((memory) => memory, reader);
  appWithoutCypher = await startTestApp();
});

after(async () => {
  await app.stop();
  await appWithoutCypher.stop();
});

async function call(args: Record<string, unknown>) {
  const client = await app.connect();
  try {
    return await client.callTool({ name: "run_read_only_cypher", arguments: args });
  } finally {
    await client.close();
  }
}

const oneRow = () =>
  Promise.resolve({ columns: ["n"], rows: [{ n: 1 }], totalRows: 1, truncated: false });

test("the tool exists only when the server has a Cypher reader", async () => {
  const withReader = await app.connect();
  const without = await appWithoutCypher.connect();

  const toolsWith = (await withReader.listTools()).tools.map((tool) => tool.name);
  const toolsWithout = (await without.listTools()).tools.map((tool) => tool.name);

  assert.ok(toolsWith.includes("run_read_only_cypher"));
  assert.ok(!toolsWithout.includes("run_read_only_cypher"));
  await withReader.close();
  await without.close();
});

test("the instructions name the tool only when it exists", async () => {
  const withReader = await app.connect();
  const without = await appWithoutCypher.connect();

  assert.match(withReader.getInstructions() ?? "", /run_read_only_cypher/);
  assert.doesNotMatch(without.getInstructions() ?? "", /run_read_only_cypher/);
  await withReader.close();
  await without.close();
});

test("is read-only and idempotent, and says so", async () => {
  const client = await app.connect();

  const tool = (await client.listTools()).tools.find(({ name }) => name === "run_read_only_cypher");

  assert.equal(tool?.annotations?.readOnlyHint, true);
  assert.equal(tool?.annotations?.idempotentHint, true);
  await client.close();
});

test("passes the statement and only the options that were given, and gives the rows", async () => {
  calls.length = 0;
  outcome = oneRow;

  const result = await call({ statement: "RETURN 1 AS n", timeoutMs: 900, maxRows: 5 });

  assert.notEqual(result.isError, true);
  assert.deepEqual(JSON.parse(textOf(result)), {
    columns: ["n"],
    rows: [{ n: 1 }],
    totalRows: 1,
    truncated: false,
  });
  assert.deepEqual(calls, [
    { statement: "RETURN 1 AS n", options: { timeoutMs: 900, maxRows: 5 } },
  ]);
});

test("passes no option when none was given", async () => {
  calls.length = 0;
  outcome = oneRow;

  await call({ statement: "RETURN 1 AS n", memoryLimitMb: 10 });
  await call({ statement: "RETURN 2 AS n" });

  assert.deepEqual(
    calls.map(({ options }) => options),
    [{ memoryLimitMb: 10 }, {}],
  );
});

test("a cut answer carries a hint that says how to get the rest", async () => {
  outcome = () =>
    Promise.resolve({ columns: ["n"], rows: [{ n: 1 }], totalRows: 40, truncated: true });

  const answer = JSON.parse(textOf(await call({ statement: "MATCH (n) RETURN n" }))) as {
    hint: string;
    totalRows: number;
  };

  assert.equal(answer.totalRows, 40);
  assert.match(answer.hint, /40 rows/);
  assert.match(answer.hint, /LIMIT/);
  assert.match(answer.hint, /maxRows/);
});

test("a statement that is refused is an error the AI can read", async () => {
  outcome = () => Promise.reject(new InvalidCypherError("CREATE is not accepted"));

  const result = await call({ statement: "CREATE (n)" });

  assert.equal(result.isError, true);
  assert.match(textOf(result), /CREATE is not accepted/);
});

test("a statement that runs out of time says the limit used", async () => {
  outcome = () => Promise.reject(new QueryTimeoutError(700));

  const result = await call({ statement: "RETURN 1", timeoutMs: 700 });

  assert.equal(result.isError, true);
  assert.match(textOf(result), /700 ms/);
});

test("refuses a field the tool does not have, and a missing statement", async () => {
  for (const args of [{ statement: "RETURN 1", limit: 3 }, {}]) {
    const result = await call(args);
    assert.equal(result.isError, true, JSON.stringify(args));
  }
});
