import type { Attribute } from "../api/types.ts";
import { describeProvenance, formatDate, seenAt } from "../format.ts";

// The attributes of one entity, grouped by name and qualifier, the newest first inside each of them. Each
// row is one observation: the whole set of values the tool found together. A name and qualifier with
// several rows has more than one observation: the current one and the sets that were replaced by it. A name
// with several qualifiers is described by several sources side by side, none of them replacing the others.
//
// The newest observation of each name and qualifier is the current one and the others are marked replaced. When the
// attributes shown are only some of the entity's (a filter), `all` has every one of them, because the current one is
// the newest of ALL, even if the filter hides it.
export function AttributesTable({
  attributes,
  all = attributes,
}: {
  attributes: Attribute[];
  all?: Attribute[];
}) {
  if (attributes.length === 0) {
    return <p className="muted">No attributes.</p>;
  }

  const sorted = [...attributes].sort(
    (first, second) =>
      first.name.localeCompare(second.name) ||
      (first.qualifier ?? "").localeCompare(second.qualifier ?? "") ||
      (seenAt(second.provenance) ?? 0) - (seenAt(first.provenance) ?? 0),
  );

  const current = currentOf(all);

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
          <tr key={index} className={current.has(attribute) ? undefined : "muted"}>
            <td>
              {attribute.name}
              {attribute.qualifier !== undefined && (
                <div className="muted">{attribute.qualifier}</div>
              )}
            </td>
            <td className="value">
              {attribute.values.map((value) => (
                <div key={value}>{value}</div>
              ))}
              {attribute.values.length > 1 && (
                <div className="muted">{attribute.values.length} values, found together</div>
              )}
              <div className={current.has(attribute) ? "ok" : "muted"}>
                {current.has(attribute) ? "current" : "replaced"}
              </div>
            </td>
            <td>{describeProvenance(attribute.provenance)}</td>
            <td>{formatDate(seenAt(attribute.provenance))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The newest observation of each name and qualifier (by when it was seen; the first one listed when they tie).
function currentOf(attributes: readonly Attribute[]): Set<Attribute> {
  const newest = new Map<string, Attribute>();

  for (const attribute of attributes) {
    const key = JSON.stringify([attribute.name, attribute.qualifier ?? null]);
    const best = newest.get(key);
    if (
      best === undefined ||
      (seenAt(attribute.provenance) ?? 0) > (seenAt(best.provenance) ?? 0)
    ) {
      newest.set(key, attribute);
    }
  }

  return new Set(newest.values());
}
