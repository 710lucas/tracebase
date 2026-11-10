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

// The origin is at distance 0. The relations seen by several runs are several relations in the graph but one
// line in the drawing: an edge is drawn once for each source, target and type.
export function toGraphElements(neighbourhood: Neighbourhood): GraphElements {
  const entities = [{ ...neighbourhood.origin, distance: 0 }, ...neighbourhood.entities];
  const nodes = entities.map((entity) => ({
    data: {
      id: entityId(entity),
      type: entity.type,
      value: entity.value,
      distance: entity.distance,
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
