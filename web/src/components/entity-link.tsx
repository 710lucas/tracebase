import { Link } from "react-router-dom";
import type { EntityRef } from "../api/types.ts";

// A link to the page of one entity. The value goes in the query string, encoded: SpiderFoot values can
// hold spaces, line breaks and URLs, which would not fit in a path.
export function EntityLink({ entity }: { entity: EntityRef }) {
  const query = new URLSearchParams({ type: entity.type, value: entity.value });

  return (
    <Link to={`/entity?${query}`} className="entity-link">
      <span className="badge">{entity.type}</span> <span className="value">{entity.value}</span>
    </Link>
  );
}
