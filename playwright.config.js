import { defineConfig } from "@playwright/test";

// Runs against the already-built production server (client/dist served by
// Express) - `npm run build` must be run first. See README's "Running
// tests" section.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm start",
    // No real flyer imports during tests: no weekly timer, and Import now
    // talks to an address that refuses the connection.
    env: {
      FLYER_AUTO_IMPORT: "off",
      FLIPP_BASE_URL: "http://127.0.0.1:9/flipp",
      LE_RABAIS_URL: "http://127.0.0.1:9/Tableau.md",
    },
    url: "http://localhost:4000/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
