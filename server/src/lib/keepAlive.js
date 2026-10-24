// How long the HTTP server keeps an idle connection open. index.js applies it to the
// server it starts; this is the one place the numbers live.
//
// Node closes a connection that has sat idle for 5 seconds. A client or proxy that keeps
// connections longer than that and sends its next request on one just as the server closes
// it gets "read ECONNRESET" (or a 502 from the proxy) on a request that was fine. Render puts
// a proxy in front of the app and reuses its connections to the app for up to about 120
// seconds, so the app has to hold an idle connection open longer than that: then it is
// always the proxy that closes it, never the app.
export const KEEP_ALIVE_TIMEOUT_MS = 125_000;

// Node needs headersTimeout above keepAliveTimeout: on a reused connection the headers
// timer runs from when the last response finished, so a smaller one would cut the idle
// connection off at headersTimeout instead.
export const HEADERS_TIMEOUT_MS = 130_000;

export function applyKeepAliveTimeouts(server) {
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  return server;
}
