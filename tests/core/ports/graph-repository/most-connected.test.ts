import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntity } from "../../../../src/core/domain/entity/index.ts";
import {
  DEFAULT_MOST_CONNECTED_LIMIT,
  InvalidMostConnectedError,
  rankMostConnected,
  resolveMostConnectedOptions,
  type ConnectedEntity,
} from "../../../../src/core/ports/graph-repository/index.ts";

const connected = (type: string, value: string, total: number): ConnectedEntity => ({
  entity: createEntity(type, value),
  total,
  incoming: total,
  outgoing: 0,
});

test("the limit defaults to 10", () => {
  assert.deepEqual(resolveMostConnectedOptions(), { limit: DEFAULT_MOST_CONNECTED_LIMIT });
  assert.equal(DEFAULT_MOST_CONNECTED_LIMIT, 10);
});

test("the limit can be raised with no upper limit", () => {
  assert.deepEqual(resolveMostConnectedOptions({ limit: 5_000_000 }), { limit: 5_000_000 });
});

for (const limit of [0, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`refuses the limit ${limit}`, () => {
    assert.throws(() => resolveMostConnectedOptions({ limit }), InvalidMostConnectedError);
  });
}

test("ranks by total, then type, then value, and keeps the first ones", () => {
  const ranked = rankMostConnected(
    [
      connected("B", "x", 1),
      connected("A", "z", 2),
      connected("A", "y", 2),
      connected("B", "w", 5),
    ],
    3,
  );

  assert.deepEqual(
    ranked.map(({ entity: { type, value } }) => `${type}:${value}`),
    ["B:w", "A:y", "A:z"],
  );
});

test("does not change the list it was given", () => {
  const given = [connected("A", "a", 1), connected("A", "b", 2)];

  rankMostConnected(given, 1);

  assert.deepEqual(
    given.map(({ entity: { value } }) => value),
    ["a", "b"],
  );
});
