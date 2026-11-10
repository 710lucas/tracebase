import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getNeighbourhood } from "../api/client.ts";
import { EntityLink } from "../components/entity-link.tsx";
import { GraphCanvas, type SelectedNode } from "../components/graph-canvas.tsx";
import { RequestView } from "../components/request-view.tsx";
import { colorOfType, entityId, toGraphElements } from "../graph-elements.ts";
import { formatNumber } from "../format.ts";
import { useRequest } from "../hooks/use-request.ts";

const DEFAULT_HOPS = 2;
const DEFAULT_MAX_ENTITIES = 200;
const HOP_CHOICES = [1, 2, 3, 4];

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
  const state = useRequest(
    () => getNeighbourhood({ type, value }, { hops, maxEntities }),
    [type, value, hops, maxEntities],
  );

  function change(name: string, newValue: number) {
    const next = new URLSearchParams(searchParams);
    next.set(name, String(newValue));
    setSearchParams(next);
    setSelected(null);
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
            {[50, 100, 200, 500, 1000].map((choice) => (
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
  selected: SelectedNode | null;
  onSelect: (node: SelectedNode | null) => void;
  originId: string;
}) {
  const { neighbourhood, selected, onSelect, originId } = props;
  const elements = useMemo(() => toGraphElements(neighbourhood), [neighbourhood]);
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

// A whole number from 1 in the address, or the default when it is missing or makes no sense.
function positiveNumber(raw: string | null, fallback: number): number {
  const parsed = Number(raw);
  return raw !== null && Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : fallback;
}
