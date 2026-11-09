import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { InvalidCypherError } from "../../../src/core/ports/cypher-reader/index.ts";
import { QueryTimeoutError } from "../../../src/core/ports/graph-repository/index.ts";
import {
  connectToMemgraph,
  DEFAULT_MEMGRAPH_URL,
  type MemgraphConnection,
} from "../../../src/adapters/memgraph/memgraph-connection.ts";
import { readCypher } from "../../../src/adapters/memgraph/read-cypher.ts";

// What the statement of the plan B goes through before the database answers: the guard, the memory limit added
// to the statement, the log, the mapping of the errors. The first tests use a fake connection to see exactly what
// is sent; the rest run on the real Memgraph (skipped when none answers, as in the other adapter tests) to prove
// what `docs/memgraph.md` says: the read transaction refuses writes and administration, and stops at the time and
// memory limits.
function fakeConnection(outcome: () => Promise<unknown>) {
  const sent: { query: string; timeoutMs: number }[] = [];
  const connection = {
    runReadOnly: async (query: string, timeoutMs: number) => {
      sent.push({ query, timeoutMs });
      return outcome();
    },
  } as unknown as MemgraphConnection;

  return { connection, sent };
}

const answers = () => Promise.resolve({ columns: ["x"], rows: [{ x: 1 }, { x: 2 }, { x: 3 }] });

before(() => {
  mock.method(console, "log", () => {});
});

test("sends the statement with the memory limit on a line of its own, and the time limit", async () => {
  const { connection, sent } = fakeConnection(answers);

  await readCypher(connection, "RETURN 1 AS x;", { timeoutMs: 1234, memoryLimitMb: 64 });

  assert.deepEqual(sent, [{ query: "RETURN 1 AS x\nQUERY MEMORY LIMIT 64MB", timeoutMs: 1234 }]);
});

test("a comment at the end of the statement does not swallow the memory limit", async () => {
  const { connection, sent } = fakeConnection(answers);

  await readCypher(connection, "RETURN 1 AS x // the one");

  assert.equal(sent[0]?.query, "RETURN 1 AS x // the one\nQUERY MEMORY LIMIT 256MB");
});

test("uses the default time limit of the reads", async () => {
  const { connection, sent } = fakeConnection(answers);

  await readCypher(connection, "RETURN 1 AS x");

  assert.equal(sent[0]?.timeoutMs, 30000);
});

test("cuts the rows at maxRows and says how many there were", async () => {
  const { connection } = fakeConnection(answers);

  const result = await readCypher(connection, "RETURN 1 AS x", { maxRows: 2 });

  assert.deepEqual(result, {
    columns: ["x"],
    rows: [{ x: 1 }, { x: 2 }],
    totalRows: 3,
    truncated: true,
  });
});

test("logs the statement", async () => {
  const { connection } = fakeConnection(answers);
  const log = mock.method(console, "log", () => {});

  await readCypher(connection, "RETURN 1 AS x");

  assert.deepEqual(log.mock.calls[0]?.arguments, ["cypher read: RETURN 1 AS x"]);
  log.mock.restore();
  mock.method(console, "log", () => {});
});

test("does not send a statement the guard refuses, nor log it", async () => {
  const { connection, sent } = fakeConnection(answers);

  await assert.rejects(
    readCypher(connection, "MATCH (n) DETACH DELETE n"),
    (error) => error instanceof InvalidCypherError,
  );

  assert.deepEqual(sent, []);
});

test("does not send a statement with an option that makes no sense", async () => {
  const { connection, sent } = fakeConnection(answers);

  await assert.rejects(readCypher(connection, "RETURN 1", { maxRows: 0 }), /maxRows/);

  assert.deepEqual(sent, []);
});

test("an error of the statement becomes an invalid Cypher with the words of the database", async () => {
  const clientError = Object.assign(new Error("Syntax error at 'FOO'"), {
    code: "Memgraph.ClientError.MemgraphError.MemgraphError",
  });
  const { connection } = fakeConnection(() => Promise.reject(clientError));

  await assert.rejects(
    readCypher(connection, "RETURN FOO"),
    (error) => error instanceof InvalidCypherError && /Syntax error at 'FOO'/.test(error.message),
  );
});

test("a memory limit error says which limit and what to change", async () => {
  const transient = Object.assign(new Error("Memory limit exceeded! Attempting to allocate"), {
    code: "Memgraph.TransientError.MemgraphError.MemgraphError",
  });
  const { connection } = fakeConnection(() => Promise.reject(transient));

  await assert.rejects(
    readCypher(connection, "RETURN 1", { memoryLimitMb: 8 }),
    (error) =>
      error instanceof InvalidCypherError &&
      /more than 8 MB/.test(error.message) &&
      /memoryLimitMb/.test(error.message),
  );
});

test("a timeout and an unknown error go on as they are", async () => {
  const timeout = new QueryTimeoutError(500);
  const other = new Error("the connection fell");

  await assert.rejects(
    readCypher(fakeConnection(() => Promise.reject(timeout)).connection, "RETURN 1"),
    timeout,
  );
  await assert.rejects(
    readCypher(fakeConnection(() => Promise.reject(other)).connection, "RETURN 1"),
    other,
  );
  await assert.rejects(
    readCypher(fakeConnection(() => Promise.reject("not an error")).connection, "RETURN 1"),
    (thrown) => thrown === "not an error",
  );
});

// ---- on the real Memgraph ----

async function tryConnecting(): Promise<MemgraphConnection | null> {
  try {
    return await connectToMemgraph({ url: process.env["MEMGRAPH_URL"] ?? DEFAULT_MEMGRAPH_URL });
  } catch {
    return null;
  }
}

const memgraph = await tryConnecting();
const skipWithoutMemgraph = memgraph === null ? "no Memgraph is running" : false;
const real = () => memgraph as MemgraphConnection;

// The entities of these tests have the value prefix `__test_cypher__`, which no other test file deletes.
async function clean(): Promise<void> {
  await real().run("MATCH (n) WHERE n.value STARTS WITH '__test_cypher__' DETACH DELETE n");
  await real().run("MATCH (n:__test_cypher_write__) DETACH DELETE n");
}

before(async () => {
  if (memgraph === null) return;
  await clean();
  await real().run(
    "CREATE (:Entity {type: 'T', value: '__test_cypher__a'})-[:LINKS {tool: 'x'}]->(:Entity {type: 'T', value: '__test_cypher__b'})",
  );
});

after(async () => {
  if (memgraph === null) return;
  await clean();
  await memgraph.close();
});

const ENTITIES = "MATCH (n:Entity) WHERE n.value STARTS WITH '__test_cypher__'";

test("reads rows and the names of the columns", { skip: skipWithoutMemgraph }, async () => {
  const result = await readCypher(real(), `${ENTITIES} RETURN n.value AS value ORDER BY value`);

  assert.deepEqual(result, {
    columns: ["value"],
    rows: [{ value: "__test_cypher__a" }, { value: "__test_cypher__b" }],
    totalRows: 2,
    truncated: false,
  });
});

test("gives the columns when there is no row", { skip: skipWithoutMemgraph }, async () => {
  const result = await readCypher(
    real(),
    "MATCH (n:Entity {value: '__nobody__'}) RETURN n.value AS v",
  );

  assert.deepEqual(result.columns, ["v"]);
  assert.equal(result.totalRows, 0);
});

test("gives nodes and relations as plain data", { skip: skipWithoutMemgraph }, async () => {
  const result = await readCypher(
    real(),
    `${ENTITIES} AND n.value ENDS WITH 'a' MATCH (n)-[r]->(m) RETURN n, r, m.value AS target`,
  );

  assert.deepEqual(result.rows, [
    {
      n: { labels: ["Entity"], properties: { type: "T", value: "__test_cypher__a" } },
      r: { type: "LINKS", properties: { tool: "x" } },
      target: "__test_cypher__b",
    },
  ]);
});

test("cuts at maxRows", { skip: skipWithoutMemgraph }, async () => {
  const result = await readCypher(real(), `${ENTITIES} RETURN n.value AS v ORDER BY v`, {
    maxRows: 1,
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.totalRows, 2);
  assert.equal(result.truncated, true);
});

test("a syntax error is an invalid Cypher", { skip: skipWithoutMemgraph }, async () => {
  await assert.rejects(
    readCypher(real(), "MATCH (n RETURN n"),
    (error) => error instanceof InvalidCypherError,
  );
});

test(
  "the database itself refuses a write that gets past the guard",
  { skip: skipWithoutMemgraph },
  async () => {
    for (const statement of [
      "CREATE (:__test_cypher_write__)",
      "MERGE (:__test_cypher_write__)",
      `${ENTITIES} SET n.touched = true`,
      `${ENTITIES} DETACH DELETE n`,
    ]) {
      await assert.rejects(real().runReadOnly(statement, 5000), /misaligned/, statement);
    }

    const rows = await real().run(
      "MATCH (n) WHERE n:__test_cypher_write__ OR n.touched = true RETURN count(n) AS count",
    );
    assert.equal(rows[0]?.["count"], 0);
    const entities = await readCypher(real(), `${ENTITIES} RETURN count(n) AS count`);
    assert.deepEqual(entities.rows, [{ count: 2 }]);
  },
);

test(
  "the database itself refuses the administrative commands",
  { skip: skipWithoutMemgraph },
  async () => {
    for (const statement of [
      "SHOW TRANSACTIONS",
      "FREE MEMORY",
      "SET DATABASE SETTING 'log.level' TO 'WARNING'",
      "CREATE INDEX ON :__test_cypher_write__(x)",
    ]) {
      await assert.rejects(
        real().runReadOnly(statement, 5000),
        /not allowed in multicommand transactions/,
        statement,
      );
    }
  },
);

test("stops a statement at the time limit", { skip: skipWithoutMemgraph }, async () => {
  const started = Date.now();

  await assert.rejects(
    readCypher(
      real(),
      "UNWIND range(1, 2000000) AS x UNWIND range(1, 2000) AS y RETURN count(*) AS n",
      {
        timeoutMs: 500,
      },
    ),
    (error) => error instanceof QueryTimeoutError && error.timeoutMs === 500,
  );
  assert.ok(Date.now() - started < 5000, "it did not stop within seconds of the limit");
});

test("stops a statement at the memory limit, at once", { skip: skipWithoutMemgraph }, async () => {
  const started = Date.now();

  await assert.rejects(
    readCypher(real(), "UNWIND range(1, 6000000) AS x WITH collect(x) AS xs RETURN size(xs) AS n", {
      memoryLimitMb: 20,
    }),
    (error) => error instanceof InvalidCypherError && /more than 20 MB/.test(error.message),
  );
  assert.ok(Date.now() - started < 5000, "it did not fail fast");
});

test(
  "a bigger memory limit lets the same statement run",
  { skip: skipWithoutMemgraph },
  async () => {
    const result = await readCypher(
      real(),
      "UNWIND range(1, 600000) AS x WITH collect(x) AS xs RETURN size(xs) AS n",
      { memoryLimitMb: 2000 },
    );

    assert.deepEqual(result.rows, [{ n: 600000 }]);
  },
);
