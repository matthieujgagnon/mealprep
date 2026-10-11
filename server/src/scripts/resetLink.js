// npm run reset-link -- someone@example.com
//
// Prints a one-time reset link for an existing account: for when an admin is
// locked out (the Reset link button in Admin needs a logged-in admin) or when
// email can't be sent. Meant to be run from Render's Shell, where the server's
// settings (DATABASE_URL, APP_URL) are already in place. It makes the link the
// same way the Admin button does (lib/resetLink.js): it works once, expires in
// 1 hour and replaces any link the account hadn't used yet.
//
// For an email with no account it says "No such account." and nothing else.
// Every use is logged on one line with the time and the email (never the link).
import path from "path";
import { fileURLToPath } from "url";

// A local run reads server/.env; on Render there is none and the settings are
// already in the environment. (The imports below wait for this: they read
// DATABASE_URL when they load.)
try {
  process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env"));
} catch {
  // no .env file
}

const { prisma } = await import("../lib/prisma.js");
const { RESET_TOKEN_TTL_MS, resetLinkForEmail } = await import("../lib/resetLink.js");

const typed = (process.argv[2] ?? "").trim();
const logUse = (outcome) => console.log(`[reset-link] ${new Date().toISOString()} used for ${typed}: ${outcome}`);

if (!typed) {
  console.error("Usage: npm run reset-link -- someone@example.com");
  process.exit(1);
}

try {
  const link = await resetLinkForEmail(typed);
  if (!link) {
    logUse("No such account.");
    process.exitCode = 1;
  } else {
    logUse("reset link made.");
    console.log(
      `\nOne-time reset link for ${link.email} (works once, expires in ${RESET_TOKEN_TTL_MS / 3600000} hour, replaces any earlier unused link):\n\n${link.url}\n`
    );
    if (!process.env.APP_URL) {
      console.log("APP_URL isn't set on this server, so the link starts with http://localhost:5173. Replace that part with your site's address.\n");
    }
  }
} catch (err) {
  console.error("Couldn't make the link:", err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
