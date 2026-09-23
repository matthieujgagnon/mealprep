import { describe, expect, it } from "vitest";
import { assertSafeRecipeUrl } from "./urlSafety.js";

// Locks in the SSRF fix: recipe import must never be pointed at an internal
// address. Each of these previously would have been fetched by the server
// with zero validation.
describe("assertSafeRecipeUrl", () => {
  it("rejects localhost", async () => {
    await expect(assertSafeRecipeUrl("http://localhost:4000/api/health")).rejects.toThrow();
  });

  it("rejects loopback IPs", async () => {
    await expect(assertSafeRecipeUrl("http://127.0.0.1/")).rejects.toThrow();
  });

  it("rejects the cloud metadata address", async () => {
    await expect(assertSafeRecipeUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow();
  });

  it("rejects private LAN ranges (10.x, 172.16-31.x, 192.168.x)", async () => {
    await expect(assertSafeRecipeUrl("http://10.0.0.5/")).rejects.toThrow();
    await expect(assertSafeRecipeUrl("http://172.20.0.5/")).rejects.toThrow();
    await expect(assertSafeRecipeUrl("http://192.168.1.1/")).rejects.toThrow();
  });

  it("rejects non-http(s) protocols", async () => {
    await expect(assertSafeRecipeUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(assertSafeRecipeUrl("ftp://example.com/")).rejects.toThrow();
  });

  it("rejects a malformed URL", async () => {
    await expect(assertSafeRecipeUrl("not a url")).rejects.toThrow();
  });

  it("allows a real public https URL through", async () => {
    // 1.1.1.1 (Cloudflare) resolves instantly and is a stable, always-public
    // address - used here only to prove a legitimate public host passes.
    await expect(assertSafeRecipeUrl("https://1.1.1.1/")).resolves.toBeUndefined();
  });
});
