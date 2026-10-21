// Raised when someone tries to build a Relation that breaks an invariant.
// Its own file for the same reason as `InvalidEntityError`.
export class InvalidRelationError extends Error {
  constructor(reason: string) {
    super(`Invalid relation: ${reason}`);
    this.name = "InvalidRelationError";
  }
}
