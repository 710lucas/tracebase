import { Link } from "react-router-dom";
import { getEntityTypes, getMostConnected, getRuns, getStatus } from "../api/client.ts";
import { BarList } from "../components/bar-list.tsx";
import { EntityLink } from "../components/entity-link.tsx";
import { RequestView } from "../components/request-view.tsx";
import { growthOverTime, summarizeByTool } from "../dashboard-figures.ts";
import { formatDate, formatNumber } from "../format.ts";
import { useRequest } from "../hooks/use-request.ts";

// How many entity types and how many of the most connected entities the dashboard shows.
const TYPES_SHOWN = 10;
const MOST_CONNECTED_SHOWN = 10;

// What is in the graph, at a glance: the size, the entity types, what each tool brought, how the graph grew import
// by import and which entities have the most relations. Each block asks for its own data, so one that fails does not
// hide the others.
export function DashboardPage() {
  return (
    <>
      <h1>Dashboard</h1>
      <Totals />
      <EntityTypes />
      <Tools />
      <Growth />
      <MostConnected />
    </>
  );
}

function Totals() {
  const state = useRequest(getStatus, []);

  return (
    <RequestView state={state}>
      {(status) =>
        status.totals === undefined ? null : (
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
        )
      }
    </RequestView>
  );
}

function EntityTypes() {
  const state = useRequest(getEntityTypes, []);

  return (
    <>
      <h2>Entities by type</h2>
      <RequestView state={state}>
        {(types) => (
          <>
            <BarList
              bars={types.slice(0, TYPES_SHOWN).map(({ type, count }) => ({
                key: type,
                label: <Link to={`/browse/${encodeURIComponent(type)}`}>{type}</Link>,
                value: count,
              }))}
            />
            {types.length > TYPES_SHOWN && (
              <p className="muted">
                and {types.length - TYPES_SHOWN} more types, in <Link to="/browse">Browse</Link>
              </p>
            )}
          </>
        )}
      </RequestView>
    </>
  );
}

function Tools() {
  const state = useRequest(getRuns, []);

  return (
    <>
      <h2>By tool</h2>
      <RequestView state={state}>
        {(runs) => (
          <table>
            <thead>
              <tr>
                <th>Tool</th>
                <th className="number">Runs</th>
                <th className="number">Relations</th>
                <th className="number">Attributes</th>
              </tr>
            </thead>
            <tbody>
              {summarizeByTool(runs).map((tool) => (
                <tr key={tool.tool}>
                  <td>{tool.tool}</td>
                  <td className="number">{formatNumber(tool.runs)}</td>
                  <td className="number">{formatNumber(tool.relations)}</td>
                  <td className="number">{formatNumber(tool.attributes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </RequestView>
    </>
  );
}

// Relations stored after each import, accumulated. Entities are not counted by run, so they are not here.
function Growth() {
  const state = useRequest(getRuns, []);

  return (
    <>
      <h2>Growth by import</h2>
      <RequestView state={state}>
        {(runs) =>
          runs.length === 0 ? (
            <p className="muted">Nothing has been imported yet.</p>
          ) : (
            <>
              <BarList
                bars={growthOverTime(runs).map((point) => ({
                  key: `${point.tool}/${point.run}`,
                  label: (
                    <>
                      <code>{point.run}</code>{" "}
                      <span className="muted">{formatDate(point.receivedAt)}</span>
                    </>
                  ),
                  value: point.accumulatedRelations,
                }))}
              />
              <p className="muted">Relations stored, accumulated after each import.</p>
            </>
          )
        }
      </RequestView>
    </>
  );
}

function MostConnected() {
  const state = useRequest(() => getMostConnected(MOST_CONNECTED_SHOWN), []);

  return (
    <>
      <h2>Most connected entities</h2>
      <RequestView state={state}>
        {(connected) =>
          connected.length === 0 ? (
            <p className="muted">No entity has a relation yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Entity</th>
                  <th className="number">Relations</th>
                  <th className="number">In</th>
                  <th className="number">Out</th>
                </tr>
              </thead>
              <tbody>
                {connected.map(({ entity, total, incoming, outgoing }) => (
                  <tr key={`${entity.type}/${entity.value}`}>
                    <td>
                      <EntityLink entity={entity} />
                    </td>
                    <td className="number">{formatNumber(total)}</td>
                    <td className="number">{formatNumber(incoming)}</td>
                    <td className="number">{formatNumber(outgoing)}</td>
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
