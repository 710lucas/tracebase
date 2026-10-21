// Raised when someone tries to build a Provenance that breaks an invariant.
// Its own file for the same reason as `InvalidEntityError`: "what can go wrong" is a different
// responsibility from "how it is built".
export class InvalidProvenanceError extends Error {
  constructor(reason: string) {
    super(`Invalid provenance: ${reason}`);
    this.name = "InvalidProvenanceError";
  }
}
