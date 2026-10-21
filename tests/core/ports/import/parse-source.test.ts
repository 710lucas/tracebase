import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidImportBatchError } from "../../../../src/core/ports/import/index.ts";
import { parseSource } from "../../../../src/core/ports/import/parse-source.ts";

test("reads tool and run", () => {
  assert.deepEqual(parseSource({ tool: "spiderfoot", run: "scan1" }, "source"), {
    tool: "spiderfoot",
    run: "scan1",
  });
});

test("rejects a blank tool or run through the domain rule, at the source path", () => {
  assert.throws(
    () => parseSource({ tool: " ", run: "scan1" }, "source"),
    (error: unknown) => error instanceof InvalidImportBatchError && error.path === "source",
  );
  assert.throws(() => parseSource({ tool: "t", run: "" }, "source"), InvalidImportBatchError);
});

test("rejects missing fields and extra fields", () => {
  assert.throws(() => parseSource({ tool: "t" }, "source"), InvalidImportBatchError);
  assert.throws(
    () => parseSource({ tool: "t", run: "r", x: 1 }, "source"),
    InvalidImportBatchError,
  );
});
