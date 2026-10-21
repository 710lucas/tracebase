// Raised when someone tries to build an Attribute that breaks an invariant.
// Its own file for the same reason as `InvalidEntityError`.
export class InvalidAttributeError extends Error {
  constructor(reason: string) {
    super(`Invalid attribute: ${reason}`);
    this.name = "InvalidAttributeError";
  }
}
