import { expect, test } from "vitest";
import type { Neighbourhood } from "./api/types.ts";
import { colorOfType, entityId, toGraphElements } from "./graph-elements.ts";

const ip = { type: "IP_ADDRESS", value: "10.0.0.1" };
const host = { type: "DOMAIN_NAME", value: "a.example.com" };

const neighbourhood: Neighbourhood = {
  origin: ip,
  hops: 2,
  maxEntities: 200,
  entities: [{ ...host, distance: 1 }],
  relations: [
    { source: host, target: ip },
    { source: host, target: ip },
    { source: ip, target: host, type: "RESOLVES" },
  ],
  truncated: false,
};

test("the origin is a node at distance 0 and the others keep their distance", () => {
  const { nodes } = toGraphElements(neighbourhood);

  expect(nodes.map(({ data }) => [data.type, data.value, data.distance])).toEqual([
    ["IP_ADDRESS", "10.0.0.1", 0],
    ["DOMAIN_NAME", "a.example.com", 1],
  ]);
});

test("a node is identified by type and value together", () => {
  expect(entityId({ type: "A", value: "x" })).not.toBe(entityId({ type: "B", value: "x" }));
  expect(entityId({ type: "A", value: "x" })).toBe(entityId({ type: "A", value: "x" }));
});

test("the same link seen twice is one edge, and a different type is another edge", () => {
  const { edges } = toGraphElements(neighbourhood);

  expect(edges).toHaveLength(2);
  expect(edges.map(({ data }) => data.label)).toEqual([undefined, "RESOLVES"]);
  expect(edges[0]?.data.source).toBe(entityId(host));
  expect(edges[0]?.data.target).toBe(entityId(ip));
});

test("an entity with no neighbour is a single node with no edge", () => {
  const alone: Neighbourhood = { ...neighbourhood, entities: [], relations: [] };

  const { nodes, edges } = toGraphElements(alone);

  expect(nodes).toHaveLength(1);
  expect(edges).toEqual([]);
});

test("a type always has the same colour and different types usually differ", () => {
  expect(colorOfType("IP_ADDRESS")).toBe(colorOfType("IP_ADDRESS"));
  expect(colorOfType("IP_ADDRESS")).not.toBe(colorOfType("DOMAIN_NAME"));
  expect(colorOfType("X")).toMatch(/^hsl\(\d+, 60%, 52%\)$/);
});
