import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntity } from "../../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../../src/core/domain/provenance/index.ts";
import { createRelation } from "../../../../src/core/domain/relation/index.ts";
import {
  createEntityNeighbourhood,
  InvalidNeighbourhoodOptionsError,
} from "../../../../src/core/ports/graph-repository/index.ts";

const origin = createEntity("HOST", "origin");
const near = createEntity("HOST", "near");
const farB = createEntity("HOST", "b-far");
const farA = createEntity("EMAIL", "a-far");
const provenance = createProvenance({ tool: "t", run: "r" });

const parts = {
  origin,
  hops: 3,
  maxEntities: 3,
  offset: 0,
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

// In order the four reached entities are: origin (0), near (1), a-far (2), b-far (3).
test("a page is a slice of the ordered list and says where the next one starts", () => {
  const first = createEntityNeighbourhood({ ...parts, maxEntities: 2 });
  const second = createEntityNeighbourhood({ ...parts, maxEntities: 2, offset: 2 });

  assert.deepEqual(
    first.entities.map(({ entity }) => entity.value),
    ["origin", "near"],
  );
  assert.equal(first.truncated, true);
  assert.equal(first.nextOffset, 2);
  assert.deepEqual(
    second.entities.map(({ entity }) => entity.value),
    ["a-far", "b-far"],
  );
  assert.equal(second.offset, 2);
  assert.equal(second.truncated, false);
  assert.equal("nextOffset" in second, false);
});

test("a relation comes in the page of the entity that comes later in the order", () => {
  const firstPage = createEntityNeighbourhood({ ...parts, maxEntities: 2 });
  const secondPage = createEntityNeighbourhood({ ...parts, maxEntities: 2, offset: 2 });

  // origin-near has both ends in the first page; near-a-far has its later end (a-far) in the second.
  assert.deepEqual(
    firstPage.relations.map(({ target }) => target.value),
    ["near"],
  );
  assert.deepEqual(
    secondPage.relations.map(({ target }) => target.value),
    ["a-far"],
  );
});

test("a page keeps the relations from earlier pages to its entities, and not those to later ones", () => {
  const farToFar = createRelation({ source: farB, target: farA, provenance });
  const originToFarB = createRelation({ source: origin, target: farB, provenance });
  const withMore = { ...parts, relations: [...parts.relations, farToFar, originToFarB] };

  const firstPage = createEntityNeighbourhood({ ...withMore, maxEntities: 3 });
  const lastPage = createEntityNeighbourhood({ ...withMore, maxEntities: 3, offset: 3 });

  // Page one (origin, near, a-far) cannot show anything that touches b-far, which comes after it.
  assert.equal(firstPage.relations.length, 2);
  // The last page (b-far) shows both relations of b-far, whose other ends were delivered before.
  assert.equal(lastPage.relations.length, 2);
});

test("an offset past the end of the list is refused", () => {
  assert.throws(
    () => createEntityNeighbourhood({ ...parts, offset: 4 }),
    (error: unknown) =>
      error instanceof InvalidNeighbourhoodOptionsError && /past the end/.test(error.message),
  );
});
