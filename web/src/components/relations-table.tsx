import type { EntityRef, Relation } from "../api/types.ts";
import { describeProvenance, formatDate, seenAt } from "../format.ts";
import { EntityLink } from "./entity-link.tsx";

// The relations of one entity, each as seen from it: the other end is the link, and the arrow says which
// way the relation points. The same relation reported by two runs appears twice, once per run.
export function RelationsTable({
  entity,
  relations,
}: {
  entity: EntityRef;
  relations: Relation[];
}) {
  if (relations.length === 0) {
    return <p className="muted">No relations.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th></th>
          <th>Relation</th>
          <th>Other entity</th>
          <th>Reported by</th>
          <th>Seen</th>
        </tr>
      </thead>
      <tbody>
        {relations.map((relation, index) => {
          const outgoing = isSame(relation.source, entity);

          return (
            <tr key={index}>
              <td title={outgoing ? "this entity points to the other" : "the other points here"}>
                {outgoing ? "→" : "←"}
              </td>
              <td>{relation.type ?? <span className="muted">unnamed</span>}</td>
              <td>
                <EntityLink entity={outgoing ? relation.target : relation.source} />
              </td>
              <td>{describeProvenance(relation.provenance)}</td>
              <td>{formatDate(seenAt(relation.provenance))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function isSame(first: EntityRef, second: EntityRef): boolean {
  return first.type === second.type && first.value === second.value;
}
