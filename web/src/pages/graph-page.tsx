import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getNeighbourhood } from "../api/client.ts";
import { EntityLink } from "../components/entity-link.tsx";
import { GraphCanvas, type SelectedNode } from "../components/graph-canvas.tsx";
import { RequestView } from "../components/request-view.tsx";
import {
  colorOfType,
  entityId,
  mergeElements,
  toGraphElements,
  type GraphElements,
} from "../graph-elements.ts";
import { formatNumber } from "../format.ts";
import { useRequest } from "../hooks/use-request.ts";

const NO_ELEMENTS: GraphElements = { nodes: [], edges: [] };
const DEFAULT_HOPS = 2;
const DEFAULT_MAX_ENTITIES = 200;
const HOP_CHOICES = [1, 2, 3, 4];
// What the selector offers, and also the number in the address when it is another one.
const MAX_ENTITIES_CHOICES = [50, 100, 200, 500, 1000];

// The neighbourhood of one entity (named in the address, `?type=...&value=...`) drawn as a graph: the entities within
// some relations of it, coloured by type, with the relations between them. Clicking a node shows what it is and
// links to its page and to its own graph. `hops` and `maxEntities` can be in the address too.
export function GraphPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const type = searchParams.get("type") ?? "";
  const value = searchParams.get("value") ?? "";
  const hops = positiveNumber(searchParams.get("hops"), DEFAULT_HOPS);
  const maxEntities = positiveNumber(searchParams.get("maxEntities"), DEFAULT_MAX_ENTITIES);

  const [selected, setSelected] = useState<SelectedNode | null>(null);
  // What the expansions found, on top of the neighbourhood the address asks for. A new address starts from none.
  const [expansions, setExpansions] = useState<GraphElements>(NO_ELEMENTS);
  const state = useRequest(
    () => getNeighbourhood({ type, value }, { hops, maxEntities }),
    [type, value, hops, maxEntities],
  );

  // Another entity's graph is another address: nothing of the last one is kept.
  useEffect(() => {
    setSelected(null);
    setExpansions(NO_ELEMENTS);
  }, [type, value]);

  function change(name: string, newValue: number) {
    const next = new URLSearchParams(searchParams);
    next.set(name, String(newValue));
    setSearchParams(next);
    setSelected(null);
    setExpansions(NO_ELEMENTS);
  }

  return (
    <>
      <p>
        <Link to={`/entity?${new URLSearchParams({ type, value })}`}>← the entity</Link>
      </p>
      <h1 className="value">{value}</h1>
      <p>
        <span className="badge">{type}</span> <span className="muted">neighbourhood</span>
      </p>

      <div className="search">
        <label>
          Relations away{" "}
          <select value={hops} onChange={(event) => change("hops", Number(event.target.value))}>
            {HOP_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        </label>
        <label>
          Entities at most{" "}
          <select
            value={maxEntities}
            onChange={(event) => change("maxEntities", Number(event.target.value))}
          >
            {[...new Set([...MAX_ENTITIES_CHOICES, maxEntities])]
              .sort((first, second) => first - second)
              .map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
          </select>
        </label>
      </div>

      <RequestView state={state}>
        {(neighbourhood) =>
          neighbourhood === null ? (
            <p className="muted">Nothing in the graph mentions this entity.</p>
          ) : (
            <Drawing
              neighbourhood={neighbourhood}
              expansions={expansions}
              onExpand={(added) => setExpansions((current) => mergeElements(current, added))}
              maxEntities={maxEntities}
              selected={selected}
              onSelect={setSelected}
              originId={entityId({ type, value })}
            />
          )
        }
      </RequestView>
    </>
  );
}

function Drawing(props: {
  neighbourhood: NonNullable<Awaited<ReturnType<typeof getNeighbourhood>>>;
  expansions: GraphElements;
  onExpand: (added: GraphElements) => void;
  maxEntities: number;
  selected: SelectedNode | null;
  onSelect: (node: SelectedNode | null) => void;
  originId: string;
}) {
  const { neighbourhood, expansions, onExpand, maxEntities, selected, onSelect, originId } = props;
  const elements = useMemo(
    () => mergeElements(toGraphElements(neighbourhood), expansions),
    [neighbourhood, expansions],
  );
  const [expansion, setExpansion] = useState<ExpansionState>({ status: "idle" });

  // What an expansion said is about the node it was for.
  useEffect(() => setExpansion({ status: "idle" }), [selected]);

  // Draws the relations of the selected entity (one relation away) on top of what is there.
  async function expand(node: SelectedNode) {
    setExpansion({ status: "loading" });
    try {
      const found = await getNeighbourhood(node, { hops: 1, maxEntities });
      if (found === null) {
        setExpansion({ status: "done", message: "Nothing more is known about it." });
        return;
      }
      const added = toGraphElements(found, node.distance);
      const known = new Set(elements.nodes.map(({ data }) => data.id));
      const newEntities = added.nodes.filter(({ data }) => !known.has(data.id)).length;
      onExpand(added);
      setExpansion({
        status: "done",
        message:
          (newEntities === 0
            ? "No new entity."
            : `${formatNumber(newEntities)} new ${newEntities === 1 ? "entity" : "entities"}.`) +
          (found.truncated ? " More exist: raise “Entities at most” and expand again." : ""),
      });
    } catch (error) {
      setExpansion({ status: "error", message: (error as Error).message });
    }
  }
  const types = [...new Set(elements.nodes.map(({ data }) => data.type))].sort();

  return (
    <>
      <p className="muted">
        {formatNumber(elements.nodes.length)} entities and {formatNumber(elements.edges.length)}{" "}
        links
        {neighbourhood.truncated &&
          " (the neighbourhood is bigger: raise “Entities at most” to see more)"}
      </p>

      <div className="graph-layout">
        <GraphCanvas elements={elements} originId={originId} onSelect={onSelect} />

        <aside className="graph-side">
          <h2>Selected</h2>
          {selected === null ? (
            <p className="muted">Click an entity.</p>
          ) : (
            <>
              <EntityLink entity={selected} />
              <p className="muted">
                {selected.distance === 0
                  ? "the origin"
                  : `${selected.distance} ${selected.distance === 1 ? "relation" : "relations"} away`}
              </p>
              <p>
                <button
                  disabled={expansion.status === "loading"}
                  onClick={() => void expand(selected)}
                >
                  Expand
                </button>
              </p>
              {expansion.status === "done" && <p className="muted">{expansion.message}</p>}
              {expansion.status === "error" && (
                <p className="error" role="alert">
                  Could not expand: {expansion.message}
                </p>
              )}
              <p>
                <Link
                  to={`/graph?${new URLSearchParams({ type: selected.type, value: selected.value })}`}
                >
                  Draw its neighbourhood
                </Link>
              </p>
            </>
          )}

          <h2>Types</h2>
          <ul className="plain">
            {types.map((entityType) => (
              <li key={entityType}>
                <span className="swatch" style={{ background: colorOfType(entityType) }} />{" "}
                {entityType}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}

type ExpansionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

// A whole number from 1 in the address, or the default when it is missing or makes no sense.
function positiveNumber(raw: string | null, fallback: number): number {
  const parsed = Number(raw);
  return raw !== null && Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : fallback;
}
