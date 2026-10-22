import { createApp } from "./adapters/http/index.ts";

// Composition root: the only place that starts the process. It decides the port and prints where
// the server is, nothing else. `PORT` comes from the environment so the same code runs anywhere.
const DEFAULT_PORT = 3000;
const port = Number(process.env["PORT"] ?? DEFAULT_PORT);

createApp().listen(port, () => {
  console.log(`import API listening on http://localhost:${port}/imports`);
});
