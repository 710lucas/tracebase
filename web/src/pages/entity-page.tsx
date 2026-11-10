import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getEntity } from "../api/client.ts";
import type { EntityFindings } from "../api/types.ts";
import { AttributesTable } from "../components/attributes-table.tsx";
import { EntityTimelineView } from "../components/entity-timeline-view.tsx";
import { ProvenanceFilterBar } from "../components/provenance-filter-bar.tsx";
import { RelationsTable } from "../components/relations-table.tsx";
import { RequestView } from "../components/request-view.tsx";
import { formatNumber } from "../format.ts";
import { useRequest } from "../hooks/use-request.ts";
import {
  applyFilter,
  choicesOf,
  isFiltering,
  NO_FILTER,
  type ProvenanceFilter,
} from "../provenance-filter.ts";

// Everything the graph holds about one entity, named in the address (`?type=...&value=...`): its
// relations in both directions and its attributes, each with where it came from.
export function EntityPage() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") ?? "";
  const value = searchParams.get("value") ?? "";

  const state = useRequest(() => getEntity(type, value), [type, value]);
  // Narrows the relations and attributes below by where they came from; it starts from nothing for each entity.
  const [filter, setFilter] = useState<ProvenanceFilter>(NO_FILTER);
  useEffect(() => setFilter(NO_FILTER), [type, value]);

  return (
    <>
      <p>
        <Link to={`/browse/${encodeURIComponent(type)}`}>← {type}</Link>
      </p>
      <h1 className="value">{value}</h1>
      <p>
        <span className="badge">{type}</span>{" "}
        <Link to={`/graph?${new URLSearchParams({ type, value })}`}>View as a graph</Link>
      </p>

      <RequestView state={state}>
        {(findings) =>
          findings === null ? (
            <p className="muted">Nothing in the graph mentions this entity.</p>
          ) : (
            <>
              <ProvenanceFilterBar
                choices={choicesOf(findings)}
                filter={filter}
                onChange={setFilter}
              />
              <Filtered findings={findings} filter={filter} />

              <h2>Timeline</h2>
              <EntityTimelineView findings={findings} />
            </>
          )
        }
      </RequestView>
    </>
  );
}

// The relations and the attributes of the entity, narrowed by the filter, each heading with how many are shown (of
// how many, when a filter hides some).
function Filtered({ findings, filter }: { findings: EntityFindings; filter: ProvenanceFilter }) {
  const shown = applyFilter(findings, filter);
  const counted = (kept: number, all: number) =>
    isFiltering(filter) ? `${formatNumber(kept)} of ${formatNumber(all)}` : formatNumber(all);

  return (
    <>
      <h2>Relations ({counted(shown.relations.length, findings.relations.length)})</h2>
      <RelationsTable entity={findings.entity} relations={shown.relations} />

      <h2>Attributes ({counted(shown.attributes.length, findings.attributes.length)})</h2>
      <AttributesTable attributes={shown.attributes} all={findings.attributes} />
    </>
  );
}
