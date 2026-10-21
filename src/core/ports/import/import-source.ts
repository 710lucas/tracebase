// Who produced the batch: one tool, one run. Stated once per batch because that is how tools work
// (a run is a single execution of a single tool), and repeating it on every item would only invite
// inconsistencies. Each item's provenance is built from this plus the item's own optional fields.
export interface ImportSource {
  readonly tool: string;
  readonly run: string;
}
