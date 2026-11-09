import { test } from "node:test";
import assert from "node:assert/strict";
import { createAttribute } from "../../../../src/core/domain/attribute/index.ts";
import { createEntity } from "../../../../src/core/domain/entity/index.ts";
import { createProvenance } from "../../../../src/core/domain/provenance/index.ts";
import { createRelation } from "../../../../src/core/domain/relation/index.ts";
import {
  createEntityNeighbourhood,
  toLeanNeighbourhood,
} from "../../../../src/core/ports/graph-repository/index.ts";

const origin = createEntity("IP_ADDRESS", "104.21.2.94");
const domain = createEntity("INTERNET_NAME", "example.com");
const port = createEntity("TCP_PORT_OPEN", "104.21.2.94:443");
const provenance = createProvenance({ tool: "spiderfoot", run: "scan-1", module: "sfp_x" });

const neighbourhood = createEntityNeighbourhood({
  origin,
  hops: 2,
  maxEntities: 10,
  offset: 0,
  reached: [
    { entity: origin, distance: 0 },
    { entity: domain, distance: 1 },
    { entity: port, distance: 1 },
  ],
  relations: [
    createRelation({ source: origin, target: domain, type: "resolves_to", provenance }),
    createRelation({ source: origin, target: port, provenance }),
  ],
  attributes: [
    createAttribute({
      entity: origin,
      name: "GEOINFO",
      values: ["San Francisco, US"],
      qualifier: "sfp_ipinfo",
      provenance,
    }),
    createAttribute({ entity: domain, name: "NOTE", values: ["x"], provenance }),
  ],
});

test("keeps the origin with its attributes (name, values, qualifier) and no provenance", () => {
  assert.deepEqual(toLeanNeighbourhood(neighbourhood).origin, {
    type: "IP_ADDRESS",
    value: "104.21.2.94",
    attributes: [{ name: "GEOINFO", values: ["San Francisco, US"], qualifier: "sfp_ipinfo" }],
  });
});

test("lists the other entities with type, value and distance, without their attributes", () => {
  assert.deepEqual(toLeanNeighbourhood(neighbourhood).entities, [
    { type: "INTERNET_NAME", value: "example.com", distance: 1 },
    { type: "TCP_PORT_OPEN", value: "104.21.2.94:443", distance: 1 },
  ]);
});

test("names the two ends of each relation and keeps its type only when it has one", () => {
  assert.deepEqual(toLeanNeighbourhood(neighbourhood).relations, [
    {
      source: { type: "IP_ADDRESS", value: "104.21.2.94" },
      target: { type: "INTERNET_NAME", value: "example.com" },
      type: "resolves_to",
    },
    {
      source: { type: "IP_ADDRESS", value: "104.21.2.94" },
      target: { type: "TCP_PORT_OPEN", value: "104.21.2.94:443" },
    },
  ]);
});

test("carries the hops, the maximum and whether it was cut", () => {
  const lean = toLeanNeighbourhood(neighbourhood);

  assert.equal(lean.hops, 2);
  assert.equal(lean.maxEntities, 10);
  assert.equal(lean.truncated, false);
});

test("an origin without attributes has an empty list", () => {
  const alone = createEntityNeighbourhood({
    origin,
    hops: 1,
    maxEntities: 5,
    offset: 0,
    reached: [{ entity: origin, distance: 0 }],
    relations: [],
    attributes: [],
  });

  assert.deepEqual(toLeanNeighbourhood(alone).origin.attributes, []);
  assert.deepEqual(toLeanNeighbourhood(alone).entities, []);
});

test("in a page after the first the origin is only its type and value, and is not in the entities", () => {
  const secondPage = createEntityNeighbourhood({
    origin,
    hops: 2,
    maxEntities: 1,
    offset: 1,
    reached: [
      { entity: origin, distance: 0 },
      { entity: domain, distance: 1 },
      { entity: port, distance: 1 },
    ],
    relations: [createRelation({ source: origin, target: domain, provenance })],
    attributes: [
      createAttribute({ entity: origin, name: "GEOINFO", values: ["x"], provenance }),
      createAttribute({ entity: domain, name: "NOTE", values: ["y"], provenance }),
    ],
  });

  const lean = toLeanNeighbourhood(secondPage);

  assert.deepEqual(lean.origin, { type: "IP_ADDRESS", value: "104.21.2.94" });
  assert.deepEqual(lean.entities, [{ type: "INTERNET_NAME", value: "example.com", distance: 1 }]);
  assert.equal(lean.offset, 1);
  assert.equal(lean.nextOffset, 2);
  assert.equal(lean.truncated, true);
});

test("the first page carries its offset, and the next one when more entities remain", () => {
  const firstPage = createEntityNeighbourhood({
    origin,
    hops: 2,
    maxEntities: 2,
    offset: 0,
    reached: [
      { entity: origin, distance: 0 },
      { entity: domain, distance: 1 },
      { entity: port, distance: 1 },
    ],
    relations: [],
    attributes: [],
  });

  const lean = toLeanNeighbourhood(firstPage);

  assert.equal(lean.offset, 0);
  assert.equal(lean.nextOffset, 2);
  assert.deepEqual(lean.origin.attributes, []);
});

test("the last page has no next offset", () => {
  assert.equal("nextOffset" in toLeanNeighbourhood(neighbourhood), false);
});
