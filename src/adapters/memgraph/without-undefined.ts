// The driver does not accept `undefined` as a value, and a field the tool did not send must not exist
// in the database. Used on every record the adapter sends as a parameter.
export function withoutUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}
