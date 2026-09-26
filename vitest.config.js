import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["client/src/lib/**/*.test.js", "server/src/**/*.test.js"],
  },
});
