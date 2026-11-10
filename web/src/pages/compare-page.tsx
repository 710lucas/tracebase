import { useSearchParams } from "react-router-dom";
import { compareRuns, getRuns } from "../api/client.ts";
import type { ComparedEntities, RunRef, RunSummary } from "../api/types.ts";
import { EntityLink } from "../components/entity-link.tsx";
import { RequestView } from "../components/request-view.tsx";
import { describeRun, figuresByType } from "../compare-figures.ts";
import { formatDate, formatNumber } from "../format.ts";
import { useRequest } from "../hooks/use-request.ts";

// How many entities of each group are listed (the counts and the table by type are always complete).
const LISTED = 50;

// Two runs side by side by the entities each one saw: what only the first saw, what both saw and what only the
// second brought. The runs are named in the address (`aTool`, `aRun`, `bTool`, `bRun`); without them the two most
// recent runs are compared, the older one as the first.
export function ComparePage() {
  const runs = useRequest(getRuns, []);

  return (
    <>
      <h1>Compare runs</h1>
      <RequestView state={runs}>
        {(list) =>
          list.length < 2 ? (
            <p className="muted">
              Two runs are needed to compare, and the graph has {list.length}.
            </p>
          ) : (
            <Comparison runs={list} />
          )
        }
      </RequestView>
    </>
  );
}

function Comparison({ runs }: { runs: RunSummary[] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  // `runs` comes most recently received first: the newest is the second run and the one before it the first.
  const a = runFromAddress(searchParams, "a") ?? (runs[1] as RunSummary);
  const b = runFromAddress(searchParams, "b") ?? (runs[0] as RunSummary);

  function choose(side: "a" | "b", chosen: RunRef) {
    const next = new URLSearchParams({
      aTool: a.tool,
      aRun: a.run,
      bTool: b.tool,
      bRun: b.run,
    });
    next.set(`${side}Tool`, chosen.tool);
    next.set(`${side}Run`, chosen.run);
    setSearchParams(next);
  }

  const state = useRequest(() => compareRuns(a, b, LISTED), [a.tool, a.run, b.tool, b.run]);

  return (
    <>
      <div className="search">
        <RunSelect label="First run" runs={runs} value={a} onChange={(run) => choose("a", run)} />
        <RunSelect label="Second run" runs={runs} value={b} onChange={(run) => choose("b", run)} />
      </div>

      <RequestView state={state}>
        {(comparison) =>
          comparison === null ? (
            <p className="muted">One of the runs is not in the graph.</p>
          ) : (
            <>
              <div className="totals">
                <div>
                  <strong>{formatNumber(comparison.onlyA.total)}</strong> only in the first
                </div>
                <div>
                  <strong>{formatNumber(comparison.both.total)}</strong> in both
                </div>
                <div>
                  <strong>{formatNumber(comparison.onlyB.total)}</strong> only in the second
                </div>
              </div>
              <p className="muted">
                An entity is seen by a run when a relation or an attribute of that run mentions it.
                Only the entities are compared; the relations and attributes each run stored are in
                Imports.
              </p>

              <h2>By type</h2>
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th className="number">Only in the first</th>
                    <th className="number">In both</th>
                    <th className="number">Only in the second</th>
                  </tr>
                </thead>
                <tbody>
                  {figuresByType(comparison).map((figures) => (
                    <tr key={figures.type}>
                      <td>{figures.type}</td>
                      <td className="number">{formatNumber(figures.onlyA)}</td>
                      <td className="number">{formatNumber(figures.both)}</td>
                      <td className="number">{formatNumber(figures.onlyB)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <Group title="Only in the first (gone in the second)" group={comparison.onlyA} />
              <Group title="Only in the second (new)" group={comparison.onlyB} />
              <Group title="In both" group={comparison.both} />
            </>
          )
        }
      </RequestView>
    </>
  );
}

function Group({ title, group }: { title: string; group: ComparedEntities }) {
  return (
    <>
      <h2>
        {title} ({formatNumber(group.total)})
      </h2>
      {group.total === 0 ? (
        <p className="muted">None.</p>
      ) : (
        <>
          <ul className="plain">
            {group.entities.map((entity) => (
              <li key={`${entity.type}/${entity.value}`}>
                <EntityLink entity={entity} />
              </li>
            ))}
          </ul>
          {group.truncated && (
            <p className="muted">
              The first {formatNumber(group.entities.length)} of {formatNumber(group.total)}, by
              value.
            </p>
          )}
        </>
      )}
    </>
  );
}

function RunSelect(props: {
  label: string;
  runs: RunSummary[];
  value: RunRef;
  onChange: (run: RunRef) => void;
}) {
  return (
    <label>
      {props.label}{" "}
      <select
        value={JSON.stringify([props.value.tool, props.value.run])}
        onChange={(event) => {
          const [tool, run] = JSON.parse(event.target.value) as [string, string];
          props.onChange({ tool, run });
        }}
      >
        {props.runs.map((run) => (
          <option key={`${run.tool}/${run.run}`} value={JSON.stringify([run.tool, run.run])}>
            {describeRun(run)} · {formatDate(run.receivedAt)}
          </option>
        ))}
      </select>
    </label>
  );
}

function runFromAddress(searchParams: URLSearchParams, side: "a" | "b"): RunRef | null {
  const tool = searchParams.get(`${side}Tool`);
  const run = searchParams.get(`${side}Run`);
  return tool !== null && run !== null ? { tool, run } : null;
}
