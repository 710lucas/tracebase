// Raised when an import payload breaks the contract.
//
// It carries the `path` of the offending part (for example `relations[2].source.type`) because the
// sender is another program, possibly written by someone else: "something is wrong" is useless to
// them, "relations[2].source.type must be a string" is not. The API layer will turn this into a
// 400 response; the path is part of the public contract, so keep its format stable.
export class InvalidImportBatchError extends Error {
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`Invalid import batch at ${path}: ${reason}`);
    this.name = "InvalidImportBatchError";
    this.path = path;
  }
}
