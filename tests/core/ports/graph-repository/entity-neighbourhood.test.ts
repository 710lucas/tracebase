import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntity } from "../../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../../src/core/domain/provenance/index.ts";
import { createRelation } from "../../../../src/core/domain/relation/index.ts";
import { createEntityNeighbourhood } from "../../../../src/core/ports/graph-repository/index.ts";

const origin = createEntity("HOST", "origin");
const near = createEntity("HOST", "near");
const farB = createEntity("HOST", "b-far");
const farA = createEntity("EMAIL", "a-far");
const provenance = createProvenance({ tool: "t", run: "r" });

const parts = {
  origin,
  hops: 3,
  maxEntities: 3,
  reached: [
    { entity: farB, distance: 2 },
    { entity: origin, distance: 0 },
    { entity: farA, distance: 2 },
    { entity: near, distance: 1 },
  ],
  relations: [
    createRelation({ source: origin, target: near, provenance }),
    createRelation({ source: near, target: farA, provenance }),
  ],
  attributes: [],
};

test("orders by distance, then type, then value, and keeps the first maxEntities", () => {
  const neighbourhood = createEntityNeighbourhood(parts);

  assert.deepEqual(
    neighbourhood.entities.map(({ entity }) => entity.value),
    ["origin", "near", "a-far"],
  );
  assert.equal(neighbourhood.truncated, true);
});

test("keeps only the relations whose two ends were kept", () => {
  const neighbourhood = createEntityNeighbourhood({ ...parts, maxEntities: 2 });

  assert.equal(neighbourhood.relations.length, 1);
  assert.equal(neighbourhood.relations[0]?.target.value, "near");
});

test("is not truncated when the maximum is exactly what was reached", () => {
  assert.equal(createEntityNeighbourhood({ ...parts, maxEntities: 4 }).truncated, false);
});
