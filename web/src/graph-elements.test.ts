import { expect, test } from "vitest";
import type { Neighbourhood } from "./api/types.ts";
import { colorOfType, entityId, mergeElements, toGraphElements } from "./graph-elements.ts";

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

test("the distances of an expansion count from the entity that was expanded", () => {
  const { nodes } = toGraphElements(neighbourhood, 2);

  expect(nodes.map(({ data }) => data.distance)).toEqual([2, 3]);
});

test("merging adds only the nodes and edges that are new and keeps what was there", () => {
  const current = toGraphElements(neighbourhood);
  const other = { type: "ASN", value: "AS1" };
  const expansion = toGraphElements(
    {
      origin: host,
      hops: 1,
      maxEntities: 200,
      entities: [{ ...other, distance: 1 }],
      relations: [
        { source: host, target: ip },
        { source: host, target: other },
      ],
      truncated: false,
    },
    1,
  );

  const merged = mergeElements(current, expansion);

  expect(merged.nodes.map(({ data }) => data.value)).toEqual(["10.0.0.1", "a.example.com", "AS1"]);
  // The host was at distance 1 and stays there; the new node is 1 farther than the host.
  expect(merged.nodes.map(({ data }) => data.distance)).toEqual([0, 1, 2]);
  expect(merged.edges).toHaveLength(3);
  expect(current.nodes).toHaveLength(2);
});
