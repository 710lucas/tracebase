import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCypherRows,
  DEFAULT_CYPHER_MAX_ROWS,
  DEFAULT_CYPHER_MEMORY_LIMIT_MB,
  InvalidCypherError,
  resolveCypherReadOptions,
} from "../../../../src/core/ports/cypher-reader/index.ts";

test("the options have defaults", () => {
  assert.deepEqual(resolveCypherReadOptions(), {
    maxRows: DEFAULT_CYPHER_MAX_ROWS,
    memoryLimitMb: DEFAULT_CYPHER_MEMORY_LIMIT_MB,
  });
});

test("the options can be raised, with no upper limit", () => {
  assert.deepEqual(resolveCypherReadOptions({ maxRows: 5_000_000, memoryLimitMb: 100_000 }), {
    maxRows: 5_000_000,
    memoryLimitMb: 100_000,
  });
});

for (const options of [
  { maxRows: 0 },
  { maxRows: -1 },
  { maxRows: 1.5 },
  { memoryLimitMb: 0 },
  { memoryLimitMb: 2.5 },
]) {
  test(`refuses ${JSON.stringify(options)}`, () => {
    assert.throws(() => resolveCypherReadOptions(options), InvalidCypherError);
  });
}

test("the error of an option says which option", () => {
  assert.throws(() => resolveCypherReadOptions({ maxRows: 0 }), /maxRows/);
  assert.throws(() => resolveCypherReadOptions({ memoryLimitMb: 0 }), /memoryLimitMb/);
});

test("keeps all the rows when they fit", () => {
  assert.deepEqual(createCypherRows(["x"], [{ x: 1 }, { x: 2 }], 2), {
    columns: ["x"],
    rows: [{ x: 1 }, { x: 2 }],
    totalRows: 2,
    truncated: false,
  });
});

test("keeps the first rows and says it cut the rest", () => {
  assert.deepEqual(createCypherRows(["x"], [{ x: 1 }, { x: 2 }, { x: 3 }], 2), {
    columns: ["x"],
    rows: [{ x: 1 }, { x: 2 }],
    totalRows: 3,
    truncated: true,
  });
});

test("gives the columns even with no row", () => {
  assert.deepEqual(createCypherRows(["x", "y"], [], 10), {
    columns: ["x", "y"],
    rows: [],
    totalRows: 0,
    truncated: false,
  });
});
