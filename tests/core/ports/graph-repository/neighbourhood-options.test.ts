import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NEIGHBOURHOOD_HOPS,
  DEFAULT_NEIGHBOURHOOD_MAX_ENTITIES,
  DEFAULT_NEIGHBOURHOOD_OFFSET,
  InvalidNeighbourhoodOptionsError,
  resolveNeighbourhoodOptions,
} from "../../../../src/core/ports/graph-repository/index.ts";

test("fills in the defaults when nothing is given", () => {
  assert.deepEqual(resolveNeighbourhoodOptions(), {
    hops: DEFAULT_NEIGHBOURHOOD_HOPS,
    maxEntities: DEFAULT_NEIGHBOURHOOD_MAX_ENTITIES,
    offset: DEFAULT_NEIGHBOURHOOD_OFFSET,
  });
  assert.deepEqual(resolveNeighbourhoodOptions({ hops: 5 }), {
    hops: 5,
    maxEntities: DEFAULT_NEIGHBOURHOOD_MAX_ENTITIES,
    offset: DEFAULT_NEIGHBOURHOOD_OFFSET,
  });
});

test("has no upper limit", () => {
  assert.deepEqual(
    resolveNeighbourhoodOptions({ hops: 50, maxEntities: 1_000_000, offset: 5_000 }),
    {
      hops: 50,
      maxEntities: 1_000_000,
      offset: 5_000,
    },
  );
});

for (const invalid of [
  { hops: 0 },
  { hops: 2.5 },
  { hops: Number.NaN },
  { maxEntities: 0 },
  { maxEntities: -3 },
  { maxEntities: Number.POSITIVE_INFINITY },
  { offset: -1 },
  { offset: 1.5 },
]) {
  test(`refuses ${JSON.stringify(invalid)}`, () => {
    assert.throws(() => resolveNeighbourhoodOptions(invalid), InvalidNeighbourhoodOptionsError);
  });
}
