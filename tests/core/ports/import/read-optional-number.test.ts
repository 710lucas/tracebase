import { test } from "node:test";
import assert from "node:assert/strict";
import { InvalidImportBatchError } from "../../../../src/core/ports/import/index.ts";
import { readOptionalNumber } from "../../../../src/core/ports/import/read-optional-number.ts";

test("returns undefined when absent and the number when present, including zero", () => {
  assert.equal(readOptionalNumber({}, "k", "p"), undefined);
  assert.equal(readOptionalNumber({ k: 0 }, "k", "p"), 0);
});

test("rejects a present value that is not a finite number", () => {
  for (const bad of ["1", null, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => readOptionalNumber({ k: bad }, "k", "p"), InvalidImportBatchError);
  }
});
