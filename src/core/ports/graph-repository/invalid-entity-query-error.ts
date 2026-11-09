// Raised when a structured query makes no sense (an empty list of types, a condition without its text, a limit
// that is not a whole number...).
//
// Its own file because "what can go wrong" is a different responsibility from "how the query is resolved".
// Callers (the REST API, later the AI tools) catch this class to tell the sender what to fix.
export class InvalidEntityQueryError extends Error {
  constructor(reason: string) {
    super(`Invalid query: ${reason}`);
    this.name = "InvalidEntityQueryError";
  }
}
