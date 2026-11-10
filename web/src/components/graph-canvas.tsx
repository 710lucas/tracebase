import cytoscape from "cytoscape";
import { useEffect, useRef } from "react";
import { colorOfType, type GraphElements } from "../graph-elements.ts";
import { groupIdOf, layoutOptions, type GraphLayout, type GraphSpacing } from "../graph-layout.ts";

// Up to this many nodes every one shows its name.
const SMALL_GRAPH = 30;

// The entities of the drawing, as opposed to the boxes that group them by type.
const ENTITIES = "node[!isGroup]";
const GROUPS = "node[?isGroup]";

export interface SelectedNode {
  type: string;
  value: string;
  distance: number;
}

interface GraphCanvasProps {
  elements: GraphElements;
  // The id of the entity the neighbourhood is about: it is drawn bigger.
  originId: string;
  // How the nodes are placed (`grouped` puts the entities of a type in a box of their own) and how far apart.
  layout: GraphLayout;
  spacing: GraphSpacing;
  // The entity types to show. Empty: all of them. The origin is always shown, so the drawing never loses its centre.
  onlyTypes: ReadonlySet<string>;
  // Called with the node that was clicked, or `null` when the click was on the empty background.
  onSelect: (node: SelectedNode | null) => void;
}

// The drawing of the graph: Cytoscape.js in one element. It draws what it is given and tells which node was
// clicked; it knows nothing about the API. Elements that are new are added to what is drawn (so an expansion keeps
// the rest in place) and the layout places them; a change of layout or spacing places everything again. The colours of
// the text and the lines come from the page's own CSS variables, so the drawing follows the light or dark scheme at the
// time it is made.
export function GraphCanvas({
  elements,
  originId,
  layout,
  spacing,
  onlyTypes,
  onSelect,
}: GraphCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const graph = useRef<cytoscape.Core | null>(null);
  const latestOnSelect = useRef(onSelect);
  latestOnSelect.current = onSelect;
  // The layout and spacing the nodes were last placed with, and the ones to place them with now.
  const placedWith = useRef({ layout, spacing });
  const wanted = useRef({ layout, spacing });
  wanted.current = { layout, spacing };

  useEffect(() => {
    const colors = getComputedStyle(document.documentElement);
    const text = colors.getPropertyValue("--text").trim() || "#1c2026";
    const line = colors.getPropertyValue("--muted").trim() || "#6a7280";

    const instance = cytoscape({
      container: container.current,
      wheelSensitivity: 0.3,
      style: [
        {
          selector: ENTITIES,
          style: {
            "background-color": "data(color)",
            color: text,
            "font-size": 10,
            "text-valign": "bottom",
            "text-margin-y": 4,
            "text-wrap": "ellipsis",
            "text-max-width": "110px",
            width: 16,
            height: 16,
          },
        },
        // A name next to every node is unreadable in a big graph, so only the origin, the node under the pointer
        // and the selected one have it, and all of them when the graph is small enough to read.
        {
          selector: "node.labelled, node[distance = 0], node:selected, node.hovered",
          style: { label: "data(value)" },
        },
        {
          selector: "node[distance = 0]",
          style: { width: 30, height: 30, "border-width": 3, "border-color": text },
        },
        // The box of a type: a faint area of the colour of the type, named at the top.
        {
          selector: GROUPS,
          style: {
            "background-color": "data(color)",
            "background-opacity": 0.08,
            "border-width": 1,
            "border-style": "dashed",
            "border-color": "data(color)",
            label: "data(label)",
            color: text,
            "font-size": 12,
            "font-weight": "bold",
            "text-valign": "top",
            "text-halign": "center",
            "text-margin-y": -6,
            padding: "24px",
            shape: "round-rectangle",
          },
        },
        // A node of a type that was filtered out is not drawn, and the lines that end at it go with it.
        { selector: "node.filtered-out", style: { display: "none" } },
        { selector: "node:selected", style: { "border-width": 3, "border-color": "#2859d9" } },
        {
          selector: "edge",
          style: {
            width: 1,
            "line-color": line,
            "target-arrow-color": line,
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": 8,
            color: line,
          },
        },
      ],
    });

    instance.on("tap", (event) => {
      if (event.target === instance) {
        latestOnSelect.current(null);
      } else if (event.target.isNode() && event.target.data("isGroup") !== true) {
        const { type, value, distance } = event.target.data() as SelectedNode;
        latestOnSelect.current({ type, value, distance });
      }
    });

    instance.on("mouseover", ENTITIES, (event) => event.target.addClass("hovered"));
    instance.on("mouseout", ENTITIES, (event) => event.target.removeClass("hovered"));

    graph.current = instance;
    return () => {
      instance.destroy();
      graph.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = graph.current;
    if (instance === null) return;

    const drawnBefore = instance.nodes(ENTITIES).length > 0;
    const stillWanted = new Set([...elements.nodes, ...elements.edges].map(({ data }) => data.id));
    instance
      .elements()
      .filter((element) => element.data("isGroup") !== true && !stillWanted.has(element.id()))
      .remove();

    const newNodes = elements.nodes.filter(({ data }) => instance.getElementById(data.id).empty());
    const newEdges = elements.edges.filter(({ data }) => instance.getElementById(data.id).empty());
    // A node that was not there yet starts next to a node it is linked to that was already drawn, so an expansion
    // grows where it was asked and the layout only has to settle it.
    instance.add([
      ...newNodes.map((node) => ({
        ...node,
        position: startingPlace(instance, node.data.id, newEdges),
      })),
      ...newEdges,
    ]);
    if (newNodes.length === 0 && newEdges.length === 0 && drawnBefore) return;

    instance.nodes(ENTITIES).toggleClass("labelled", elements.nodes.length <= SMALL_GRAPH);
    place(instance, wanted.current.layout, wanted.current.spacing, !drawnBefore);
    placedWith.current = wanted.current;
    instance.$id(originId).select();
  }, [elements, originId]);

  // Another layout or spacing places everything again, from scratch, and fits the view.
  useEffect(() => {
    const instance = graph.current;
    if (instance === null) return;
    if (placedWith.current.layout === layout && placedWith.current.spacing === spacing) return;

    place(instance, layout, spacing, true);
    placedWith.current = { layout, spacing };
  }, [layout, spacing]);

  // Hiding does not move anything: the layout was made with every node, so showing them again puts them back. A
  // box of a type with nothing left in it is hidden too.
  useEffect(() => {
    const instance = graph.current;
    if (instance === null) return;

    instance.nodes(ENTITIES).forEach((node) => {
      const hidden =
        onlyTypes.size > 0 && node.id() !== originId && !onlyTypes.has(node.data("type") as string);
      node.toggleClass("filtered-out", hidden);
    });
    instance.nodes(GROUPS).forEach((group) => {
      group.toggleClass(
        "filtered-out",
        group
          .children()
          .filter((child) => !child.hasClass("filtered-out"))
          .empty(),
      );
    });
  }, [elements, layout, onlyTypes, originId]);

  return <div ref={container} className="graph-canvas" data-testid="graph-canvas" />;
}

// Puts the entities in their boxes (only when the layout is `grouped`; in the others there are no boxes) and then
// places the nodes with the layout.
function place(
  instance: cytoscape.Core,
  layout: GraphLayout,
  spacing: GraphSpacing,
  fresh: boolean,
): void {
  syncGroups(instance, layout === "grouped");
  const entities = instance.nodes(ENTITIES).map((node) => ({
    id: node.id(),
    type: node.data("type") as string,
    distance: node.data("distance") as number,
  }));
  const links = instance.edges().map((edge) => ({
    source: edge.data("source") as string,
    target: edge.data("target") as string,
  }));
  instance.layout(layoutOptions(layout, spacing, fresh, entities, links)).run();
}

// With `grouped` each entity is the child of the box of its type, made when it is needed; without it the entities
// have no parent and the boxes are taken away.
function syncGroups(instance: cytoscape.Core, grouped: boolean): void {
  if (grouped) {
    for (const type of new Set(
      instance.nodes(ENTITIES).map((node) => node.data("type") as string),
    )) {
      if (instance.getElementById(groupIdOf(type)).empty()) {
        instance.add({
          group: "nodes",
          data: { id: groupIdOf(type), isGroup: true, label: type, color: colorOfType(type) },
        });
      }
    }
    // The origin is the centre of the drawing, outside the boxes.
    instance.nodes(ENTITIES).forEach((node) => {
      node.move({
        parent: node.data("distance") === 0 ? null : groupIdOf(node.data("type") as string),
      });
    });
  } else {
    instance.nodes(ENTITIES).forEach((node) => {
      node.move({ parent: null });
    });
    instance.nodes(GROUPS).remove();
  }
}

// Where a new node is first put: close to a node it has a relation with that is already drawn, with a small random
// shift so that nodes of the same expansion do not start on the same point. Without such a node, at the middle.
function startingPlace(
  instance: cytoscape.Core,
  id: string,
  edges: readonly { data: { source: string; target: string } }[],
): { x: number; y: number } {
  const shift = () => (Math.random() - 0.5) * 40;
  for (const { data } of edges) {
    const otherId = data.source === id ? data.target : data.target === id ? data.source : undefined;
    const other = otherId === undefined ? undefined : instance.getElementById(otherId);
    if (other !== undefined && other.nonempty() && other.isNode()) {
      const { x, y } = other.position();
      return { x: x + shift(), y: y + shift() };
    }
  }

  return { x: 0, y: 0 };
}
