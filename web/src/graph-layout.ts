import type cytoscape from "cytoscape";

// How the nodes of the graph are placed. The choices are data, so the page can list them and the tests can read them.

export const LAYOUTS = [
  { value: "sectors", label: "Spread, grouped by type" },
  { value: "grouped", label: "Grouped by type (boxes)" },
  { value: "force", label: "Spread out" },
  { value: "rings", label: "Rings by distance" },
] as const;

export type GraphLayout = (typeof LAYOUTS)[number]["value"];

// How far apart things are put: a factor applied to the distances and to the push between nodes.
export const SPACINGS = [
  { value: "compact", label: "Compact", factor: 0.6 },
  { value: "normal", label: "Normal", factor: 1 },
  { value: "wide", label: "Wide", factor: 1.8 },
] as const;

export type GraphSpacing = (typeof SPACINGS)[number]["value"];

export const DEFAULT_LAYOUT: GraphLayout = "sectors";
export const DEFAULT_SPACING: GraphSpacing = "normal";

const PADDING = 40;
// The force layout at spacing 1: how hard nodes push each other, and how long a relation wants to be.
const NODE_REPULSION = 40000;
const IDEAL_EDGE_LENGTH = 90;

export function spacingFactor(spacing: GraphSpacing): number {
  return SPACINGS.find(({ value }) => value === spacing)?.factor ?? 1;
}

// The id of the box that holds the entities of one type when the nodes are grouped.
export function groupIdOf(type: string): string {
  return `group:${type}`;
}

// An entity as the grouped layout sees it.
export interface PlacedEntity {
  id: string;
  type: string;
  distance: number;
}

export interface Point {
  x: number;
  y: number;
}

// The room one entity takes in its cluster, and the least space between two clusters, at spacing 1.
const CELL = 46;
const CLUSTER_GAP = 70;

// Where each entity goes in the grouped layout: the origin in the middle, and the others in one cluster for each
// type, the clusters on a circle around it. Inside a cluster the entities are in rows, in the order they come. The
// circle is as big as it takes for the clusters not to touch, and a wider spacing makes the cells and the gaps bigger.
// Nothing here is random, so the same graph is always drawn the same way.
export function clusterPositions(
  entities: readonly PlacedEntity[],
  spacing: GraphSpacing,
): Map<string, Point> {
  const factor = spacingFactor(spacing);
  const cell = CELL * factor;
  const positions = new Map<string, Point>();

  const byType = new Map<string, PlacedEntity[]>();
  for (const entity of entities) {
    if (entity.distance === 0) {
      positions.set(entity.id, { x: 0, y: 0 });
    } else {
      byType.set(entity.type, [...(byType.get(entity.type) ?? []), entity]);
    }
  }

  const clusters = [...byType]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([, members]) => {
      const columns = Math.max(1, Math.ceil(Math.sqrt(members.length * 1.4)));
      const rows = Math.ceil(members.length / columns);
      return { members, columns, width: columns * cell, height: rows * cell };
    });
  if (clusters.length === 0) return positions;

  const radii = clusters.map(({ width, height }) => Math.hypot(width, height) / 2);
  const gap = CLUSTER_GAP * factor;
  // Far enough that the biggest cluster clears the origin, and that two neighbours on the circle do not touch: the
  // distance between their centres (a chord of the circle) must be at least their two radii and the gap.
  const chord = (index: number) =>
    (radii[index] as number) + (radii[(index + 1) % radii.length] as number) + gap;
  const clearOfNeighbours =
    clusters.length < 2
      ? 0
      : Math.max(...clusters.map((_, index) => chord(index))) /
        (2 * Math.sin(Math.PI / clusters.length));
  const circle = Math.max(Math.max(...radii) + gap, clearOfNeighbours);

  clusters.forEach((cluster, index) => {
    const angle = (2 * Math.PI * index) / clusters.length - Math.PI / 2;
    const centre = { x: circle * Math.cos(angle), y: circle * Math.sin(angle) };

    cluster.members.forEach((member, position) => {
      const column = position % cluster.columns;
      const row = Math.floor(position / cluster.columns);
      positions.set(member.id, {
        x: centre.x - cluster.width / 2 + cell / 2 + column * cell,
        y: centre.y - cluster.height / 2 + cell / 2 + row * cell,
      });
    });
  });

  return positions;
}

// How far from the origin the first arc is, and the room between two entities on an arc and between two arcs, at
// spacing 1.
const FIRST_ARC = 110;
const ARC_CELL = 40;
// The empty angle left between two wedges, in radians.
const WEDGE_GAP = 0.08;

// Where each entity goes in the sectors layout: the origin in the middle and, around it, one wedge for each type (in
// alphabetical order). A wedge is as wide as its share of the entities (with a minimum, so a type with one entity is
// still a visible wedge). The entities of a type are on arcs inside its wedge: the first arc is near the middle, the next
// one farther, and each arc holds as many as fit with `ARC_CELL` between them, so a big type grows outward instead of
// crowding. Within a type the entities come ordered by distance from the origin and then by value. Nothing is random.
export function sectorPositions(
  entities: readonly PlacedEntity[],
  spacing: GraphSpacing,
): Map<string, Point> {
  const factor = spacingFactor(spacing);
  const cell = ARC_CELL * factor;
  const positions = new Map<string, Point>();

  const byType = new Map<string, PlacedEntity[]>();
  for (const entity of entities) {
    if (entity.distance === 0) {
      positions.set(entity.id, { x: 0, y: 0 });
    } else {
      byType.set(entity.type, [...(byType.get(entity.type) ?? []), entity]);
    }
  }
  if (byType.size === 0) return positions;

  const types = [...byType].sort(([first], [second]) => first.localeCompare(second));
  const weightOf = (members: readonly PlacedEntity[]) => members.length + 2;
  const totalWeight = types.reduce((sum, [, members]) => sum + weightOf(members), 0);

  let start = -Math.PI / 2;
  for (const [, members] of types) {
    const span = (2 * Math.PI * weightOf(members)) / totalWeight;
    const usable = Math.max(span - WEDGE_GAP, 0.05);
    const ordered = [...members].sort(
      (first, second) => first.distance - second.distance || first.id.localeCompare(second.id),
    );

    let placed = 0;
    for (let arc = 0; placed < ordered.length; arc += 1) {
      const radius = FIRST_ARC * factor + arc * cell;
      const room = Math.max(1, Math.floor((usable * radius) / cell));
      const onThisArc = ordered.slice(placed, placed + room);
      onThisArc.forEach((member, index) => {
        const angle = start + WEDGE_GAP / 2 + (usable * (index + 0.5)) / onThisArc.length;
        positions.set(member.id, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
      });
      placed += onThisArc.length;
    }

    start += span;
  }

  return positions;
}

// What Cytoscape needs to place the nodes. `fresh` is the first drawing, or a change of layout: it starts from scratch
// and fits the whole graph in the view; without it (an expansion) what is already there stays where it is.
//
// - grouped: the clusters of `clusterPositions`, with a box around each type (made by the canvas). It places everything
//   again each time, because a cluster grows when an expansion adds to it, and moves with an animation unless it is
//   the first drawing.
// - sectors: the origin in the middle and each type in a wedge of its own around it, its entities on arcs that
//   grow outward from the middle. No boxes: the types are told apart by where they are and by their colour.
// - force: a force layout (`cose`), where the nodes push each other away and the relations pull them together; the
//   spacing makes the push stronger and the relations longer.
// - rings: the origin in the middle and each distance on a ring around it.
export function layoutOptions(
  layout: GraphLayout,
  spacing: GraphSpacing,
  fresh: boolean,
  entities: readonly PlacedEntity[] = [],
): cytoscape.LayoutOptions {
  const factor = spacingFactor(spacing);

  if (layout === "grouped") {
    const positions = clusterPositions(entities, spacing);
    return {
      name: "preset",
      positions: (node: cytoscape.NodeSingular) => positions.get(node.id()) ?? { x: 0, y: 0 },
      fit: true,
      padding: PADDING,
      animate: !fresh,
      animationDuration: 300,
    } as cytoscape.LayoutOptions;
  }

  if (layout === "sectors") {
    const positions = sectorPositions(entities, spacing);
    return {
      name: "preset",
      positions: (node: cytoscape.NodeSingular) => positions.get(node.id()) ?? { x: 0, y: 0 },
      fit: true,
      padding: PADDING,
      animate: !fresh,
      animationDuration: 300,
    } as cytoscape.LayoutOptions;
  }

  if (layout === "rings") {
    return {
      name: "concentric",
      animate: false,
      fit: fresh,
      padding: PADDING,
      avoidOverlap: true,
      minNodeSpacing: 14 * factor,
      spacingFactor: 1.1 * factor,
      concentric: (node) => 1000 - (node.data("distance") as number),
      levelWidth: () => 1,
    } as cytoscape.LayoutOptions;
  }

  return {
    name: "cose",
    animate: false,
    randomize: fresh,
    fit: fresh,
    padding: PADDING,
    numIter: 1500,
    nodeRepulsion: () => NODE_REPULSION * factor,
    idealEdgeLength: () => IDEAL_EDGE_LENGTH * factor,
    nodeOverlap: 20 * factor,
    componentSpacing: 80 * factor,
    gravity: 0.25,
  } as cytoscape.LayoutOptions;
}
