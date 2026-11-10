import type { EntityRef, Neighbourhood } from "./api/types.ts";

// What the graph view draws, worked out from the neighbourhood the API answers: the nodes and the edges in the shape
// of Cytoscape, and the colour of each entity type. No drawing happens here, so it can be tested without a browser.

export interface GraphNode {
  data: {
    id: string;
    type: string;
    value: string;
    distance: number;
    color: string;
  };
}

export interface GraphEdge {
  data: {
    id: string;
    source: string;
    target: string;
    // The type of the relation, when the tool gave one (SpiderFoot does not).
    label?: string;
  };
}

export interface GraphElements {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// The identity of an entity in the drawing: its type and value together, so two entities with the same value
// and different types are two nodes.
export function entityId(entity: EntityRef): string {
  return JSON.stringify([entity.type, entity.value]);
}

// A colour for each entity type, always the same for the same type: the hue comes from the name. Neighbouring
// types in the alphabet end up far apart in hue because the hash mixes every character.
export function colorOfType(type: string): string {
  let hash = 0;
  for (const character of type) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }

  // Cytoscape reads the form with commas only.
  return `hsl(${hash}, 60%, 52%)`;
}

// The origin is at distance `originDistance` (0 for the first neighbourhood drawn; the distance of the entity that was
// expanded, for the neighbourhood of an expansion) and the others are that much farther. The relations seen by several
// runs are several relations in the graph but one line in the drawing: an edge is drawn once for each source, target
// and type.
export function toGraphElements(neighbourhood: Neighbourhood, originDistance = 0): GraphElements {
  const entities = [{ ...neighbourhood.origin, distance: 0 }, ...neighbourhood.entities];
  const nodes = entities.map((entity) => ({
    data: {
      id: entityId(entity),
      type: entity.type,
      value: entity.value,
      distance: originDistance + entity.distance,
      color: colorOfType(entity.type),
    },
  }));

  const edges = new Map<string, GraphEdge>();
  for (const { source, target, type } of neighbourhood.relations) {
    const id = JSON.stringify([entityId(source), entityId(target), type ?? null]);
    edges.set(id, {
      data: {
        id,
        source: entityId(source),
        target: entityId(target),
        ...(type !== undefined && { label: type }),
      },
    });
  }

  return { nodes, edges: [...edges.values()] };
}

// Adds what an expansion found to what is drawn. What is already there stays as it is (a node keeps the distance it
// had from the first origin) and only the new nodes and edges are added.
export function mergeElements(current: GraphElements, added: GraphElements): GraphElements {
  const nodeIds = new Set(current.nodes.map(({ data }) => data.id));
  const edgeIds = new Set(current.edges.map(({ data }) => data.id));

  return {
    nodes: [...current.nodes, ...added.nodes.filter(({ data }) => !nodeIds.has(data.id))],
    edges: [...current.edges, ...added.edges.filter(({ data }) => !edgeIds.has(data.id))],
  };
}

// A link goes "outward" when it joins an entity to one that is exactly one step farther from the origin (or nearer:
// the direction of the relation does not matter). The links between entities at the same distance (two neighbours of the
// origin that are linked to each other) and the entity linked to itself are not: they are what makes a drawing of
// neighbours a tangle, and the ones that reach farther entities are the paths out of the origin.
export function isOutwardLink(sourceDistance: number, targetDistance: number): boolean {
  return Math.abs(sourceDistance - targetDistance) === 1;
}

// How many of the links are outward ones.
export function countOutwardLinks(elements: GraphElements): number {
  const distanceOf = new Map(elements.nodes.map(({ data }) => [data.id, data.distance]));

  return elements.edges.filter(({ data }) =>
    isOutwardLink(distanceOf.get(data.source) ?? 0, distanceOf.get(data.target) ?? 0),
  ).length;
}

// The entities to draw when only some types are chosen (an empty choice is every entity): the origin, the entities of
// the chosen types and, so that each one is still connected to the origin, the entities between: from each drawn entity,
// those it is linked to that are one step nearer the origin, and so on until the origin. They are in the drawing even
// if their type was not chosen. The direction of the relations does not matter.
export function visibleNodeIds(
  elements: GraphElements,
  originId: string,
  onlyTypes: ReadonlySet<string>,
): Set<string> {
  if (onlyTypes.size === 0) return new Set(elements.nodes.map(({ data }) => data.id));

  const distanceOf = new Map(elements.nodes.map(({ data }) => [data.id, data.distance]));
  const nearer = new Map<string, Set<string>>();
  for (const { data } of elements.edges) {
    for (const [from, to] of [
      [data.source, data.target],
      [data.target, data.source],
    ] as const) {
      if ((distanceOf.get(to) ?? 0) === (distanceOf.get(from) ?? 0) - 1) {
        nearer.set(from, (nearer.get(from) ?? new Set()).add(to));
      }
    }
  }

  const visible = new Set([originId]);
  const pending: string[] = [];
  for (const { data } of elements.nodes) {
    if (onlyTypes.has(data.type)) {
      visible.add(data.id);
      pending.push(data.id);
    }
  }
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    for (const parent of nearer.get(next) ?? []) {
      if (!visible.has(parent)) {
        visible.add(parent);
        pending.push(parent);
      }
    }
  }

  return visible;
}
