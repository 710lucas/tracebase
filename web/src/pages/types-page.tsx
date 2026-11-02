import { Link } from "react-router-dom";
import { getEntityTypes } from "../api/client.ts";
import { RequestView } from "../components/request-view.tsx";
import { formatNumber } from "../format.ts";
import { useRequest } from "../hooks/use-request.ts";

// The way into the graph: the entity types it holds, the biggest first. Each one opens the list of its
// entities.
export function TypesPage() {
  const state = useRequest(getEntityTypes, []);

  return (
    <>
      <h1>Browse</h1>

      <RequestView state={state}>
        {(types) =>
          types.length === 0 ? (
            <p className="muted">The graph is empty.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Entity type</th>
                  <th className="number">Entities</th>
                </tr>
              </thead>
              <tbody>
                {types.map(({ type, count }) => (
                  <tr key={type}>
                    <td>
                      <Link to={`/browse/${encodeURIComponent(type)}`}>{type}</Link>
                    </td>
                    <td className="number">{formatNumber(count)}</td>
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
