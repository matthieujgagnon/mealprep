import dns from "node:dns/promises";
import net from "node:net";

// Blocks the recipe-import fetch from being pointed at internal/private
// addresses (localhost, LAN ranges, cloud metadata endpoints like
// 169.254.169.254) by a malicious or mistaken URL. Only plain http/https
// URLs that resolve to a public IP are allowed through.
function isPrivateOrReservedIp(ip) {
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 0) return true; // "this" network
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true; // loopback
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 ULA
    if (lower.startsWith("::ffff:")) {
      // IPv4-mapped IPv6 - check the embedded IPv4 address too.
      return isPrivateOrReservedIp(lower.replace("::ffff:", ""));
    }
    return false;
  }
  return true; // not a parseable IP at all - reject rather than guess
}

// Throws if `url` isn't a plain public http(s) URL. Resolves the hostname
// itself (rather than trusting whatever `fetch` would resolve later) so a
// hostname like "localhost" or one that points at an internal IP is caught
// before any request goes out.
export async function assertSafeRecipeUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("FETCH_FAILED: That doesn't look like a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("FETCH_FAILED: Only http and https links can be imported.");
  }

  const hostname = parsed.hostname;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("FETCH_FAILED: This URL can't be imported.");
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error("FETCH_FAILED: Couldn't resolve this URL's address.");
  }

  if (addresses.length === 0 || addresses.some((a) => isPrivateOrReservedIp(a.address))) {
    throw new Error("FETCH_FAILED: This URL can't be imported.");
  }
}
