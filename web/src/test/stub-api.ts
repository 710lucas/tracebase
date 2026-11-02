import { vi } from "vitest";

// A made-up answer of the API: a body and the status it comes with.
export interface Answer {
  status: number;
  body: unknown;
}

export function ok(body: unknown): Answer {
  return { status: 200, body };
}

export function failure(status: number, error: string): Answer {
  return { status, body: { error } };
}

// Replaces `fetch` with a fake API for one test. `routes` maps the requested path with its query string
// (`/graph/entities?type=A&value=B`) to the answer; a path with no entry is a 404. `calls` lists what was
// requested, in order, so a test can check what a screen asked for.
export function stubApi(routes: Record<string, Answer>): { calls: string[] } {
  const calls: string[] = [];

  vi.stubGlobal("fetch", async (path: string) => {
    calls.push(path);
    const answer = routes[path] ?? failure(404, `no stub for ${path}`);

    return new Response(JSON.stringify(answer.body), { status: answer.status });
  });

  return { calls };
}
