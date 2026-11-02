import { useState } from "react";
import { getStatus } from "../api/client.ts";
import { RequestView } from "../components/request-view.tsx";
import { formatNumber } from "../format.ts";
import { useRequest } from "../hooks/use-request.ts";

// What the API is running with and whether its storage answers. The settings are shown, not edited:
// they come from the environment the API was started in (`MEMGRAPH_URL`, `PORT`).
export function StatusPage() {
  const [checks, setChecks] = useState(0);
  const state = useRequest(getStatus, [checks]);

  return (
    <>
      <h1>Status</h1>

      <RequestView state={state}>
        {(status) => (
          <>
            <dl className="facts">
              <dt>Storage</dt>
              <dd>{status.storage === "memgraph" ? "Memgraph" : "In memory (lost on restart)"}</dd>

              {status.memgraphUrl !== undefined && (
                <>
                  <dt>Memgraph address</dt>
                  <dd>{status.memgraphUrl}</dd>
                </>
              )}

              <dt>Connection</dt>
              <dd>
                {status.reachable ? (
                  <span className="ok">Answering</span>
                ) : (
                  <span className="error">Not answering: {status.error}</span>
                )}
              </dd>
            </dl>

            {status.totals !== undefined && (
              <div className="totals">
                <div>
                  <strong>{formatNumber(status.totals.entities)}</strong> entities
                </div>
                <div>
                  <strong>{formatNumber(status.totals.relations)}</strong> relations
                </div>
                <div>
                  <strong>{formatNumber(status.totals.attributes)}</strong> attributes
                </div>
              </div>
            )}
          </>
        )}
      </RequestView>

      <p className="muted">
        The settings come from the environment the API was started in (<code>MEMGRAPH_URL</code>,{" "}
        <code>PORT</code>); change them there and restart the API.
      </p>
      <button type="button" onClick={() => setChecks(checks + 1)}>
        Check again
      </button>
    </>
  );
}
