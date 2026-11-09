import neo4j from "neo4j-driver";

// Turns a value that the driver returns into plain data that can be written as JSON: a node becomes its labels
// and properties, a relation its type and properties (the internal ids are left out), a path its nodes and
// relations in order, a date or a duration its text. Lists and maps are converted inside. Numbers, texts,
// booleans and null are as they are (the connection reads integers as numbers).
export function toPlainValue(value: unknown): unknown {
  if (neo4j.isNode(value)) {
    return { labels: value.labels, properties: toPlainValue(value.properties) };
  }
  if (neo4j.isRelationship(value)) {
    return { type: value.type, properties: toPlainValue(value.properties) };
  }
  if (neo4j.isPath(value)) {
    return {
      nodes: toPlainValue([value.start, ...value.segments.map((segment) => segment.end)]),
      relationships: toPlainValue(value.segments.map((segment) => segment.relationship)),
    };
  }
  if (Array.isArray(value)) {
    return value.map(toPlainValue);
  }
  if (typeof value === "object" && value !== null) {
    // A date, a time or a duration is an object with its own text; a map has only the default one.
    if (value.toString !== Object.prototype.toString) return value.toString();

    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, toPlainValue(inner)]),
    );
  }

  return value;
}
