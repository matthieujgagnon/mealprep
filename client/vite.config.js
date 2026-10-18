import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The build's short code (lib/appVersion.js): Render's commit when it builds, else
// git's, else "dev". It is sent with feedback so Matt knows which build a problem is in.
function appVersion() {
  const commit = process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA;
  if (commit) return commit.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev";
  } catch {
    return "dev";
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
