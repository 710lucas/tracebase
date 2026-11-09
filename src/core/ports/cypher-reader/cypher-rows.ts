// The answer of a Cypher read: the names of the columns and the rows as plain objects (nodes and relations
// already turned into plain data). `totalRows` is how many rows the statement produced; when it is more than
// `maxRows` only the first `maxRows` are in `rows` and `truncated` is true.
export interface CypherRows {
  readonly columns: readonly string[];
  readonly rows: readonly Record<string, unknown>[];
  readonly totalRows: number;
  readonly truncated: boolean;
}

// Builds the answer from every row the database returned, keeping the first `maxRows`. It is the one place that
// decides what "truncated" means, so every adapter says it the same way.
export function createCypherRows(
  columns: readonly string[],
  allRows: readonly Record<string, unknown>[],
  maxRows: number,
): CypherRows {
  return {
    columns,
    rows: allRows.slice(0, maxRows),
    totalRows: allRows.length,
    truncated: allRows.length > maxRows,
  };
}
