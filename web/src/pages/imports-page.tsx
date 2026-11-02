import { getRuns } from "../api/client.ts";
import { RequestView } from "../components/request-view.tsx";
import { formatDate, formatNumber } from "../format.ts";
import { useRequest } from "../hooks/use-request.ts";

// What has been imported: one row per run of a tool, the most recently received first.
//
// The counts are what each run stored. A finding that an earlier run had already stored is not stored
// again, so importing the same scan twice does not change its numbers.
export function ImportsPage() {
  const state = useRequest(getRuns, []);

  return (
    <>
      <h1>Imports</h1>

      <RequestView state={state}>
        {(runs) =>
          runs.length === 0 ? (
            <p className="muted">Nothing has been imported yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Run</th>
                  <th>First received</th>
                  <th className="number">Relations</th>
                  <th className="number">Attributes</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={`${run.tool}/${run.run}`}>
                    <td>{run.tool}</td>
                    <td>
                      <code>{run.run}</code>
                    </td>
                    <td>{formatDate(run.receivedAt)}</td>
                    <td className="number">{formatNumber(run.relations)}</td>
                    <td className="number">{formatNumber(run.attributes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </RequestView>
    </>
  );
}
