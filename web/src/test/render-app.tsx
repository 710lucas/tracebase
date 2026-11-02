import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../app.tsx";

// Mounts the whole application at an address, with a router that lives in memory instead of the
// browser's address bar.
export function renderApp(address: string) {
  return render(
    <MemoryRouter initialEntries={[address]}>
      <App />
    </MemoryRouter>,
  );
}
