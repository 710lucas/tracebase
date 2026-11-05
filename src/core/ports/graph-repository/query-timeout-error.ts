// Raised when a read of the graph takes longer than the time it was given. The read is cancelled and
// nothing partial is returned: an answer that stops halfway would look like a complete one.
//
// Its own file because "what can go wrong" is a different responsibility from "how a read is asked".
// Callers (the REST API, later the AI tools) catch this class to tell the sender to ask for less.
export class QueryTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Query exceeded ${timeoutMs / 1000} s; reduce depth, limit or filter`);
    this.name = "QueryTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}
