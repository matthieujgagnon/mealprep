import { describe, expect, it } from "vitest";
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyKeepAliveTimeouts, HEADERS_TIMEOUT_MS, KEEP_ALIVE_TIMEOUT_MS } from "./keepAlive.js";

// Render's proxy reuses its connections to the app for up to about 120 seconds, so the app
// has to keep an idle one open longer than that or a request can land on a socket the app
// just closed ("read ECONNRESET").
const PROXY_REUSES_FOR_MS = 120_000;

describe("idle connection timeouts", () => {
  it("keeps idle connections open longer than the proxy reuses them", () => {
    const server = applyKeepAliveTimeouts(http.createServer());
    expect(server.keepAliveTimeout).toBeGreaterThanOrEqual(KEEP_ALIVE_TIMEOUT_MS);
    expect(server.keepAliveTimeout).toBeGreaterThan(PROXY_REUSES_FOR_MS);
  });

  it("sets headersTimeout above keepAliveTimeout, as Node requires", () => {
    const server = applyKeepAliveTimeouts(http.createServer());
    expect(server.headersTimeout).toBeGreaterThanOrEqual(HEADERS_TIMEOUT_MS);
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
  });

  it("is applied to the server index.js starts", () => {
    const index = readFileSync(fileURLToPath(new URL("../index.js", import.meta.url)), "utf8");
    expect(index).toMatch(/const (\w+) = app\.listen\(/);
    const name = index.match(/const (\w+) = app\.listen\(/)[1];
    expect(index).toContain(`applyKeepAliveTimeouts(${name})`);
  });
});
