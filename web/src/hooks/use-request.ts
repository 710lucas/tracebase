import { useEffect, useState } from "react";

export type RequestState<T> =
  { status: "loading" } | { status: "error"; message: string } | { status: "done"; data: T };

// Runs `load` when the component appears and again whenever something in `dependencies` changes, and
// tells which of the three moments the screen is in. An answer that arrives after the screen asked
// for something newer (or left) is dropped, so a slow old request never overwrites a newer one.
export function useRequest<T>(
  load: () => Promise<T>,
  dependencies: readonly unknown[],
): RequestState<T> {
  const [state, setState] = useState<RequestState<T>>({ status: "loading" });

  useEffect(() => {
    let outdated = false;
    setState({ status: "loading" });

    load().then(
      (data) => {
        if (!outdated) setState({ status: "done", data });
      },
      (error: Error) => {
        if (!outdated) setState({ status: "error", message: error.message });
      },
    );

    return () => {
      outdated = true;
    };
  }, dependencies);

  return state;
}
