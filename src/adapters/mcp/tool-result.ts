import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { InvalidEntityError } from "../../core/domain/entity/index.ts";
import {
  InvalidEntityQueryError,
  InvalidNeighbourhoodOptionsError,
  InvalidSearchError,
  InvalidShortestPathOptionsError,
  QueryTimeoutError,
} from "../../core/ports/graph-repository/index.ts";

// What a tool answers to the AI: the answer as compact JSON text (the shape of the answer is the one of the
// core, the same as the REST routes give), or an error that says in words what went wrong.
export function toolAnswer(answer: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(answer) }] };
}

// The answer of a tool that reads by pages of `limit` results (the search and the structured query). When more
// results exist after the page it adds a hint that tells the AI how to go on, in the words of the parameters of
// the tool, which is why it is written here and not in the core.
export function pageAnswer(page: {
  readonly truncated: boolean;
  readonly nextOffset?: number;
}): CallToolResult {
  return toolAnswer(
    page.truncated
      ? {
          ...page,
          hint: `More results exist after this page: call again with offset=${page.nextOffset} for the next page, or with a bigger limit and timeoutMs to get them in one answer.`,
        }
      : page,
  );
}

// An error the AI can read and act on: `isError` tells the client the call did not give what was asked, and the
// text says what to change (a value that makes no sense, a limit to raise, an entity that is not there).
export function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

// What the AI is told when it asks about an entity that nothing in the graph mentions.
export function entityNotFound(type: string, value: string): CallToolResult {
  return toolError(`No entity of type ${type} with value ${value} is in the graph.`);
}

// The errors the core raises for a call that cannot be answered as asked. Each one's message already says what
// is wrong, so it is passed on as it is.
const ERRORS_FOR_THE_CALLER = [
  InvalidEntityError,
  InvalidNeighbourhoodOptionsError,
  InvalidShortestPathOptionsError,
  InvalidSearchError,
  InvalidEntityQueryError,
] as const;

// Runs what a tool does and turns the errors of the caller into a tool error: what the AI sent that makes no
// sense (any of `ERRORS_FOR_THE_CALLER`) and a read that ran out of time (the message says the limit used, so
// the AI can ask for less or give more). Any other error is ours and goes on, so it is not hidden.
export async function runTool(work: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await work();
  } catch (error) {
    if (ERRORS_FOR_THE_CALLER.some((errorClass) => error instanceof errorClass)) {
      return toolError((error as Error).message);
    }
    if (error instanceof QueryTimeoutError) {
      return toolError(
        `${error.message} (the limit was ${error.timeoutMs} ms; pass a bigger timeoutMs or ask for less)`,
      );
    }
    throw error;
  }
}
