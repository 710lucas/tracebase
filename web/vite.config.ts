import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Where the API listens while developing (`npm run web:dev` next to `npm start`). In production the API
// serves the built files itself, so the page and the API share one address and nothing is proxied.
const API_ADDRESS = process.env["API_ADDRESS"] ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    // The page asks for these paths on its own origin; the dev server forwards them to the API, which
    // is why the API needs no CORS.
    proxy: {
      "/imports": API_ADDRESS,
      "/graph": API_ADDRESS,
      "/status": API_ADDRESS,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
