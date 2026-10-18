// The short code of the build the person is running, sent with their feedback so
// Matt knows which version a problem is in. vite.config.js sets it when the app is
// built (Render's commit, else git's); "dev" when running from the source or in a test.
/* global __APP_VERSION__ */
export const APP_VERSION = typeof __APP_VERSION__ === "string" && __APP_VERSION__ ? __APP_VERSION__ : "dev";
