// Raised when an option of the question "which entities are the most connected" makes no sense (a limit that is
// not a whole number from 1).
//
// Its own file because "what can go wrong" is a different responsibility from "how the options are resolved".
// Callers (the REST API) catch this class to tell the sender what to fix.
export class InvalidMostConnectedError extends Error {
  constructor(reason: string) {
    super(`Invalid request: ${reason}`);
    this.name = "InvalidMostConnectedError";
  }
}
