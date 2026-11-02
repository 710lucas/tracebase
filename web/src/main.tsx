import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./app.tsx";
import "./styles.css";

// A hash router keeps the screen in the part of the address after `#` (`/#/imports`), which the browser
// never sends to the server. The API therefore only has to serve `index.html` and the built files, and
// no server route can clash with a screen.
createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
