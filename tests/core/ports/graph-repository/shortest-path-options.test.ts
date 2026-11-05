import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SHORTEST_PATH_MAX_HOPS,
  InvalidShortestPathOptionsError,
  resolveShortestPathOptions,
} from "../../../../src/core/ports/graph-repository/index.ts";

test("fills in the default when nothing is given", () => {
  assert.deepEqual(resolveShortestPathOptions(), { maxHops: DEFAULT_SHORTEST_PATH_MAX_HOPS });
  assert.equal(DEFAULT_SHORTEST_PATH_MAX_HOPS, 6);
});

test("takes the value of the request, with no upper limit", () => {
  assert.deepEqual(resolveShortestPathOptions({ maxHops: 1 }), { maxHops: 1 });
  assert.deepEqual(resolveShortestPathOptions({ maxHops: 1_000 }), { maxHops: 1_000 });
});

for (const maxHops of [0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`refuses maxHops ${maxHops}`, () => {
    assert.throws(() => resolveShortestPathOptions({ maxHops }), InvalidShortestPathOptionsError);
  });
}
