import type { GraphRepository, GraphTotals } from "../../../core/ports/graph-repository/index.ts";
import type { RuntimeInfo } from "./runtime-info.ts";

export interface StatusReport {
  storage: RuntimeInfo["storage"];
  memgraphUrl?: string;
  // Whether the storage answered a question just now.
  reachable: boolean;
  // Present when the storage answered.
  totals?: GraphTotals;
  // Present when it did not: what went wrong.
  error?: string;
}

export interface StatusService {
  getStatus(): Promise<StatusReport>;
}

// Service of the status module: says how the application is configured and whether the storage answers.
// The proof that it answers is a real question (the size of the graph), so a Memgraph that went down
// after the application started shows up here as `reachable: false` instead of an error page.
//
// The address is shown without the user and password it may carry.
export function createStatusService(
  repository: GraphRepository,
  runtimeInfo: RuntimeInfo,
): StatusService {
  const memgraphUrl =
    runtimeInfo.memgraphUrl === undefined
      ? {}
      : { memgraphUrl: withoutCredentials(runtimeInfo.memgraphUrl) };

  return {
    getStatus: async () => {
      try {
        const totals = await repository.graphTotals();
        return { storage: runtimeInfo.storage, ...memgraphUrl, reachable: true, totals };
      } catch (error) {
        return {
          storage: runtimeInfo.storage,
          ...memgraphUrl,
          reachable: false,
          error: (error as Error).message,
        };
      }
    },
  };
}

// `bolt://user:secret@host:7687` becomes `bolt://host:7687`. Text that is not an address is returned
// as it came, since there is nothing to take out of it.
function withoutCredentials(address: string): string {
  try {
    const url = new URL(address);
    url.username = "";
    url.password = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return address;
  }
}
