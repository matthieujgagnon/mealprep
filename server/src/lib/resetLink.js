import { prisma } from "./prisma.js";
import { normalizeEmail } from "./admin.js";

// Reset links, made one way for everything that makes them: the Reset link
// button in Admin (routes/admin.js), the `npm run reset-link` script
// (scripts/resetLink.js) and the "forgot password" email (routes/auth.js). A
// link is a PasswordResetToken row whose id is the secret. It works once and
// expires after RESET_TOKEN_TTL_MS; using it (POST /api/auth/reset-password)
// sets the new password and signs the account out everywhere.

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// The address of the reset page. APP_URL (set on Render) is what links use; when
// it isn't set, a request can say where the app is, and with neither the link
// points at the local dev server.
export function resetUrlFor(tokenId, { req, appUrl = process.env.APP_URL } = {}) {
  const fromRequest = req ? `${req.protocol}://${req.get("host")}` : "";
  const base = String(appUrl || fromRequest || "http://localhost:5173").replace(/\/+$/, "");
  return `${base}/reset-password?token=${tokenId}`;
}

// Makes a link for the account. With replaceUnused, every earlier link the
// account hasn't used stops working in the same transaction, so only the newest
// one is alive (what an admin wants; the forgot-password email leaves the
// others alone).
export async function createResetToken(userId, { replaceUnused = false, now = Date.now() } = {}) {
  const data = { userId, expiresAt: new Date(now + RESET_TOKEN_TTL_MS) };
  if (!replaceUnused) return prisma.passwordResetToken.create({ data });
  const [, token] = await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } }),
    prisma.passwordResetToken.create({ data }),
  ]);
  return token;
}

// An admin's link for an account: { url, expiresAt }, replacing any unused one.
export async function makeAdminResetLink(userId, options = {}) {
  const token = await createResetToken(userId, { replaceUnused: true });
  return { url: resetUrlFor(token.id, options), expiresAt: token.expiresAt };
}

// The same, found by the email typed: null when no account has it. The script
// uses this and prints nothing about an account that doesn't exist.
export async function resetLinkForEmail(email, options = {}) {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  if (!user) return null;
  return { email: user.email, ...(await makeAdminResetLink(user.id, options)) };
}
