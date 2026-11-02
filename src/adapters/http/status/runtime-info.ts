// What the running process was configured with, as far as the status screen needs to show it. The
// composition root (`main.ts`) knows it because it chose the repository; the HTTP adapter only reports
// it.
export interface RuntimeInfo {
  readonly storage: "memory" | "memgraph";
  // The address given in `MEMGRAPH_URL`; only when the storage is Memgraph.
  readonly memgraphUrl?: string;
}
