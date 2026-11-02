import { Link, useSearchParams } from "react-router-dom";
import { getEntity } from "../api/client.ts";
import { AttributesTable } from "../components/attributes-table.tsx";
import { RelationsTable } from "../components/relations-table.tsx";
import { RequestView } from "../components/request-view.tsx";
import { formatNumber } from "../format.ts";
import { useRequest } from "../hooks/use-request.ts";

// Everything the graph holds about one entity, named in the address (`?type=...&value=...`): its
// relations in both directions and its attributes, each with where it came from.
export function EntityPage() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") ?? "";
  const value = searchParams.get("value") ?? "";

  const state = useRequest(() => getEntity(type, value), [type, value]);

  return (
    <>
      <p>
        <Link to={`/browse/${encodeURIComponent(type)}`}>← {type}</Link>
      </p>
      <h1 className="value">{value}</h1>
      <p>
        <span className="badge">{type}</span>
      </p>

      <RequestView state={state}>
        {(findings) =>
          findings === null ? (
            <p className="muted">Nothing in the graph mentions this entity.</p>
          ) : (
            <>
              <h2>Relations ({formatNumber(findings.relations.length)})</h2>
              <RelationsTable entity={findings.entity} relations={findings.relations} />

              <h2>Attributes ({formatNumber(findings.attributes.length)})</h2>
              <AttributesTable attributes={findings.attributes} />
            </>
          )
        }
      </RequestView>
    </>
  );
}
