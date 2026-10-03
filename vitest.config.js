import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["client/src/i18n/testSetup.js"],
    include: ["client/src/lib/**/*.test.js", "client/src/i18n/**/*.test.js", "server/src/**/*.test.js"],
  },
});
