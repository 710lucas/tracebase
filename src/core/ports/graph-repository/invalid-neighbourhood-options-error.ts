// Raised when the hops or the maximum of entities asked for a neighbourhood make no sense.
//
// Its own file because "what can go wrong" is a different responsibility from "how the options are
// resolved". Callers (the REST API, later the AI tools) catch this class to tell the sender what to fix.
export class InvalidNeighbourhoodOptionsError extends Error {
  constructor(reason: string) {
    super(`Invalid neighbourhood options: ${reason}`);
    this.name = "InvalidNeighbourhoodOptionsError";
  }
}
