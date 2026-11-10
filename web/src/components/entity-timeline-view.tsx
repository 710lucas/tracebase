import type { EntityFindings } from "../api/types.ts";
import { buildTimeline } from "../entity-timeline.ts";
import { formatDate, formatNumber } from "../format.ts";

// The history of one entity: the runs that found something about it, from the first to the last, and how each
// attribute changed from one set of values to the next. It is worked out from what the entity page already loaded.
export function EntityTimelineView({ findings }: { findings: EntityFindings }) {
  const { runs, changes } = buildTimeline(findings);

  if (runs.length === 0) {
    return <p className="muted">Nothing to show.</p>;
  }

  return (
    <>
      <h3>Seen by</h3>
      <table>
        <thead>
          <tr>
            <th>First seen</th>
            <th>Run</th>
            <th className="number">Relations</th>
            <th className="number">Attribute sets</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={`${run.tool}/${run.run}`}>
              <td>{formatDate(run.firstSeen)}</td>
              <td>
                {run.tool} · run <code>{run.run}</code>
              </td>
              <td className="number">{formatNumber(run.relations)}</td>
              <td className="number">{formatNumber(run.attributes)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>How the attributes changed</h3>
      {changes.length === 0 ? (
        <p className="muted">No attributes.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Attribute</th>
              <th>Change</th>
              <th>Run</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change, index) => (
              <tr key={index}>
                <td>{formatDate(change.at)}</td>
                <td>
                  {change.name}
                  {change.qualifier !== undefined && (
                    <div className="muted">{change.qualifier}</div>
                  )}
                </td>
                <td className="value">
                  {change.before === undefined && <div className="muted">first reported</div>}
                  {change.added.map((value) => (
                    <div key={`+${value}`} className="added">
                      + {value}
                    </div>
                  ))}
                  {change.removed.map((value) => (
                    <div key={`-${value}`} className="removed">
                      − {value}
                    </div>
                  ))}
                  {change.added.length === 0 && change.removed.length === 0 && (
                    <div className="muted">the same values again</div>
                  )}
                </td>
                <td>
                  {change.tool} · run <code>{change.run}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
