import type { ReactNode } from "react";
import type { RequestState } from "../hooks/use-request.ts";

interface RequestViewProps<T> {
  state: RequestState<T>;
  children: (data: T) => ReactNode;
}

// What every screen shows while it waits for the API and when the API fails; once the data is there it
// hands it to the screen. The screens write only the "done" case.
export function RequestView<T>({ state, children }: RequestViewProps<T>) {
  if (state.status === "loading") {
    return <p className="muted">Loading…</p>;
  }

  if (state.status === "error") {
    return (
      <p className="error" role="alert">
        Could not load: {state.message}
      </p>
    );
  }

  return <>{children(state.data)}</>;
}
