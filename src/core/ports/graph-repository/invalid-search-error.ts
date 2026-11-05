// Raised when the text or an option of a search makes no sense (no text, an unknown scope, a limit or an
// offset that is not a whole number...).
//
// Its own file because "what can go wrong" is a different responsibility from "how the search is resolved".
// Callers (the REST API, later the AI tools) catch this class to tell the sender what to fix.
export class InvalidSearchError extends Error {
  constructor(reason: string) {
    super(`Invalid search: ${reason}`);
    this.name = "InvalidSearchError";
  }
}
