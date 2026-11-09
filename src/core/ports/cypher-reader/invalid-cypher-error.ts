// Raised when a Cypher statement or an option of reading it cannot be accepted: it is not a single read
// statement, it has a syntax error, an option is not a whole number, or it needed more memory than it was given.
//
// Its own file because "what can go wrong" is a different responsibility from "how a statement is read".
// Callers (the AI tools) catch this class to tell the sender what to change; the message says it.
export class InvalidCypherError extends Error {
  constructor(reason: string) {
    super(`Invalid Cypher: ${reason}`);
    this.name = "InvalidCypherError";
  }
}
