// Raised when someone tries to build an Entity that breaks an invariant.
//
// Its own file because "what can go wrong" is a different responsibility from "how an entity is
// built". Callers (use cases, the REST API) can catch this specific class and report a precise
// error instead of a generic one.
export class InvalidEntityError extends Error {
  constructor(reason: string) {
    super(`Invalid entity: ${reason}`);
    this.name = "InvalidEntityError";
  }
}
