// Raised when the domain rejects the value of ONE item of an import batch. It says which item (`path`, in
// the same notation the structure errors use: `attributes.3`, `relations.12`, counting from zero) and keeps
// the domain's own reason as its message, so the sender does not have to split a large batch to find the
// bad item. The domain error that caused it is kept in `cause`.
export class InvalidImportItemError extends Error {
  readonly path: string;

  constructor(path: string, cause: Error) {
    super(cause.message, { cause });
    this.name = "InvalidImportItemError";
    this.path = path;
  }
}
