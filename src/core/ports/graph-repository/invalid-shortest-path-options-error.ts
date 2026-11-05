// Raised when the maximum of hops asked for a shortest path makes no sense.
//
// Its own file because "what can go wrong" is a different responsibility from "how the options are
// resolved". Callers (the REST API, later the AI tools) catch this class to tell the sender what to fix.
export class InvalidShortestPathOptionsError extends Error {
  constructor(reason: string) {
    super(`Invalid shortest path options: ${reason}`);
    this.name = "InvalidShortestPathOptionsError";
  }
}
