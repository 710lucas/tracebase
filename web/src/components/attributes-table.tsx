import type { Attribute } from "../api/types.ts";
import { describeProvenance, formatDate, seenAt } from "../format.ts";

// The attributes of one entity, grouped by name and the newest first inside each name. Each row is one
// observation: the whole set of values the tool found together. A name with several rows has more than one
// observation: the current one and the sets that were replaced by it.
export function AttributesTable({ attributes }: { attributes: Attribute[] }) {
  if (attributes.length === 0) {
    return <p className="muted">No attributes.</p>;
  }

  const sorted = [...attributes].sort(
    (first, second) =>
      first.name.localeCompare(second.name) ||
      (seenAt(second.provenance) ?? 0) - (seenAt(first.provenance) ?? 0),
  );

  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Values</th>
          <th>Reported by</th>
          <th>Seen</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((attribute, index) => (
          <tr key={index}>
            <td>{attribute.name}</td>
            <td className="value">
              {attribute.values.map((value) => (
                <div key={value}>{value}</div>
              ))}
            </td>
            <td>{describeProvenance(attribute.provenance)}</td>
            <td>{formatDate(seenAt(attribute.provenance))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
