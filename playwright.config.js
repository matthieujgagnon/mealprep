import { defineConfig } from "@playwright/test";

// What both test servers share. No real flyer imports or Statistics Canada calls during tests: no
// hourly timer, and every outside address refuses the connection.
const serverEnv = {
  FLYER_AUTO_IMPORT: "off",
  FLIPP_BASE_URL: "http://127.0.0.1:9/flipp",
  STATCAN_WDS_URL: "http://127.0.0.1:9/wds",
  // The admins e2e/admin.spec.js, e2e/ingredient-names.spec.js, e2e/invites.spec.js,
  // e2e/admin-reset-link.spec.js, e2e/feedback.spec.js, e2e/inventory-links.spec.js and
  // e2e/ingredient-name-edits.spec.js and e2e/ingredient-matcher.spec.js log in as
  // (and one with no account).
  ADMIN_EMAILS:
    "e2e-admin@example.com, e2e-unclaimed@example.com, e2e-invites-admin@example.com, e2e-reset-admin@example.com, e2e-feedback-admin@example.com, e2e-feedback-admin-menu@example.com, e2e-feedback-admin-fr@example.com, e2e-links-admin@example.com, e2e-names-admin@example.com, e2e-name-edits-admin@example.com, e2e-matcher-admin@example.com",
  // No email goes to Matt about feedback in the tests (FEEDBACK_EMAIL_TO unset).
  FEEDBACK_EMAIL_TO: "",
  // Email is never set up in the tests (nothing is ever sent), whatever the
  // machine running them has set: "Forgot password" says it can't send.
  RESEND_API_KEY: "",
  EMAIL_FROM: "",
  RESET_EMAIL_FROM: "",
};

const server = (port) => ({
  command: "npm start",
  url: `http://localhost:${port}/api/health`,
  reuseExistingServer: !process.env.CI,
  timeout: 30_000,
});

// Runs against the already-built production server (client/dist served by
// Express) - `npm run build` must be run first. See README's "Running
// tests" section.
export default defineConfig({
  testDir: "./e2e",
  // Makes the invite code every test account signs up with (e2e/invite.js).
  globalSetup: "./e2e/global-setup.js",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4000",
    trace: "retain-on-failure",
  },
  // The browser tests sign up their own accounts and expect them empty, so their server runs with
  // NEW_ACCOUNT_EXAMPLES=off (every new account starting with examples is the product's default, see
  // server/src/lib/examples.js). The one spec about examples, e2e/examples.spec.js, runs on a second
  // server with them on.
  projects: [
    { name: "app", testIgnore: /examples\.spec\.js/ },
    { name: "examples", testMatch: /examples\.spec\.js/, use: { baseURL: "http://localhost:4001" } },
  ],
  webServer: [
    { ...server(4000), env: { ...serverEnv, PORT: "4000", NEW_ACCOUNT_EXAMPLES: "off" } },
    { ...server(4001), env: { ...serverEnv, PORT: "4001", NEW_ACCOUNT_EXAMPLES: "on" } },
  ],
});
