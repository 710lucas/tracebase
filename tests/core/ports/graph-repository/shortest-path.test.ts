import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntity, entityKey, type Entity } from "../../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../../src/core/domain/provenance/index.ts";
import { createRelation } from "../../../../src/core/domain/relation/index.ts";
import {
  chooseFixedPath,
  createShortestPath,
} from "../../../../src/core/ports/graph-repository/index.ts";

const a = createEntity("HOST", "a");
const b = createEntity("HOST", "b");
const c = createEntity("HOST", "c");
const d = createEntity("HOST", "d");

function relation(source: Entity, target: Entity, run = "run-1") {
  return createRelation({ source, target, provenance: createProvenance({ tool: "t", run }) });
}

test("a step holds every relation between its two entities, in both directions", () => {
  const path = createShortestPath({
    from: a,
    to: c,
    maxHops: 6,
    entities: [a, b, c],
    relations: [
      relation(a, b, "run-1"),
      relation(a, b, "run-2"),
      relation(b, a, "run-3"),
      relation(b, c),
      // Not between two neighbours of the path: ignored.
      relation(a, c),
      relation(c, d),
    ],
  });

  assert.deepEqual(
    path.steps.map((step) => [
      step.from.value,
      step.to.value,
      step.relations.map(({ source, provenance }) => `${source.value}@${provenance.run}`),
    ]),
    [
      ["a", "b", ["a@run-1", "a@run-2", "b@run-3"]],
      ["b", "c", ["b@run-1"]],
    ],
  );
  assert.deepEqual(path.entities, [a, b, c]);
  assert.equal(path.maxHops, 6);
});

test("a path from an entity to itself is that entity and has no step", () => {
  const path = createShortestPath({ from: a, to: a, maxHops: 6, entities: [a], relations: [] });

  assert.deepEqual(path.entities, [a]);
  assert.deepEqual(path.steps, []);
});

test("no path is empty, not an error", () => {
  const path = createShortestPath({
    from: a,
    to: d,
    maxHops: 2,
    entities: [],
    relations: [relation(a, b)],
  });

  assert.deepEqual(path.entities, []);
  assert.deepEqual(path.steps, []);
  assert.equal(path.from, a);
  assert.equal(path.to, d);
});

// a -- b -- d and a -- c -- d: two shortest paths from a to d.
const distanceToD = new Map([
  [entityKey(d), 0],
  [entityKey(b), 1],
  [entityKey(c), 1],
  [entityKey(a), 2],
]);
const neighbours = new Map<string, Entity[]>([
  [entityKey(a), [c, b]],
  [entityKey(b), [d, a]],
  [entityKey(c), [d, a]],
]);

test("chooses the path that is first in the order, whatever order the neighbours come in", async () => {
  const forward = await chooseFixedPath({
    from: a,
    distanceToTarget: distanceToD,
    neighboursOf: async (entity) => neighbours.get(entityKey(entity)) ?? [],
  });
  const reversed = await chooseFixedPath({
    from: a,
    distanceToTarget: distanceToD,
    neighboursOf: async (entity) => [...(neighbours.get(entityKey(entity)) ?? [])].reverse(),
  });

  assert.deepEqual(forward, [a, b, d]);
  assert.deepEqual(reversed, [a, b, d]);
});

test("only follows neighbours that are one relation closer to the target", async () => {
  const path = await chooseFixedPath({
    from: a,
    distanceToTarget: new Map([
      [entityKey(d), 0],
      [entityKey(c), 1],
      [entityKey(a), 2],
    ]),
    // b is a neighbour of a but is not in the map (too far from the target): never chosen.
    neighboursOf: async (entity) => neighbours.get(entityKey(entity)) ?? [],
  });

  assert.deepEqual(path, [a, c, d]);
});

test("the path is empty when the source is not within the hops of the target", async () => {
  const path = await chooseFixedPath({
    from: a,
    distanceToTarget: new Map([[entityKey(d), 0]]),
    neighboursOf: async () => [],
  });

  assert.deepEqual(path, []);
});

test("the source being the target gives a path of one entity", async () => {
  const path = await chooseFixedPath({
    from: d,
    distanceToTarget: new Map([[entityKey(d), 0]]),
    neighboursOf: async () => [],
  });

  assert.deepEqual(path, [d]);
});
