import cytoscape from "cytoscape";
import { useEffect, useRef } from "react";
import type { GraphElements } from "../graph-elements.ts";

// Up to this many nodes every one shows its name.
const SMALL_GRAPH = 30;

export interface SelectedNode {
  type: string;
  value: string;
  distance: number;
}

interface GraphCanvasProps {
  elements: GraphElements;
  // The id of the entity the neighbourhood is about: it is drawn bigger.
  originId: string;
  // The entity types to show. Empty: all of them. The origin is always shown, so the drawing never loses its centre.
  onlyTypes: ReadonlySet<string>;
  // Called with the node that was clicked, or `null` when the click was on the empty background.
  onSelect: (node: SelectedNode | null) => void;
}

// The drawing of the graph: Cytoscape.js in one element. It draws what it is given and tells which node was
// clicked; it knows nothing about the API. The elements are replaced as a whole when they change, and a force layout
// (`cose`) places the nodes. The colours of the text and the lines come from the page's own CSS variables, so the
// drawing follows the light or dark scheme at the time it is made.
export function GraphCanvas({ elements, originId, onlyTypes, onSelect }: GraphCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const graph = useRef<cytoscape.Core | null>(null);
  const latestOnSelect = useRef(onSelect);
  latestOnSelect.current = onSelect;

  useEffect(() => {
    const colors = getComputedStyle(document.documentElement);
    const text = colors.getPropertyValue("--text").trim() || "#1c2026";
    const line = colors.getPropertyValue("--muted").trim() || "#6a7280";

    const instance = cytoscape({
      container: container.current,
      wheelSensitivity: 0.3,
      style: [
        {
          selector: "node",
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
      } else if (event.target.isNode()) {
        const { type, value, distance } = event.target.data() as SelectedNode;
        latestOnSelect.current({ type, value, distance });
      }
    });

    instance.on("mouseover", "node", (event) => event.target.addClass("hovered"));
    instance.on("mouseout", "node", (event) => event.target.removeClass("hovered"));

    graph.current = instance;
    return () => {
      instance.destroy();
      graph.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = graph.current;
    if (instance === null) return;

    const drawnBefore = instance.nodes().length > 0;
    const wanted = new Set([...elements.nodes, ...elements.edges].map(({ data }) => data.id));
    instance
      .elements()
      .filter((element) => !wanted.has(element.id()))
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

    instance.nodes().toggleClass("labelled", elements.nodes.length <= SMALL_GRAPH);
    // The first drawing starts from scratch and fits the whole graph in the view; an expansion keeps what is
    // there where it is and the view where it is.
    instance
      .layout({
        name: "cose",
        animate: false,
        randomize: !drawnBefore,
        fit: !drawnBefore,
        padding: 30,
      })
      .run();
    instance.$id(originId).select();
  }, [elements, originId]);

  // Hiding does not move anything: the layout was made with every node, so showing them again puts them back.
  useEffect(() => {
    graph.current?.nodes().forEach((node) => {
      const hidden =
        onlyTypes.size > 0 && node.id() !== originId && !onlyTypes.has(node.data("type") as string);
      node.toggleClass("filtered-out", hidden);
    });
  }, [elements, onlyTypes, originId]);

  return <div ref={container} className="graph-canvas" data-testid="graph-canvas" />;
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
