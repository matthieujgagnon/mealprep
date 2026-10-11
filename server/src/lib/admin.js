import { prisma } from "./prisma.js";
import { fail } from "./i18n.js";

// Who runs the app. ONLY the ADMIN_EMAILS environment variable (emails
// separated by commas, set on Render) makes an account an admin. The `role`
// column on User records the last check so it can be read later; it never
// makes anyone an admin on its own, and nothing here reads it to decide.
//
// Signup doesn't verify emails, so a listed email with no account yet could
// be claimed by whoever signs up with it first. Signup therefore refuses
// every listed email (routes/auth.js): an account can only hold a listed
// email if it existed before the email was listed. ADMIN_EMAILS should only
// list emails that already have an account; warnAboutAdminEmails() logs the
// ones that don't when the server starts.

// Emails are compared trimmed and lowercased, on both sides.
export function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export function adminEmails(raw = process.env.ADMIN_EMAILS) {
  return new Set(String(raw ?? "").split(",").map(normalizeEmail).filter(Boolean));
}

export function isAdminEmail(email, raw = process.env.ADMIN_EMAILS) {
  const normalized = normalizeEmail(email);
  return normalized !== "" && adminEmails(raw).has(normalized);
}

// "admin" or "member", from ADMIN_EMAILS only.
export function roleFor(user, raw = process.env.ADMIN_EMAILS) {
  return isAdminEmail(user?.email, raw) ? "admin" : "member";
}

// Works out the account's role from ADMIN_EMAILS and records it on the
// account when it changed. Returns whether the account is an admin.
export async function checkAdmin(user) {
  const role = roleFor(user);
  if (user.role !== role) await prisma.user.updateMany({ where: { id: user.id }, data: { role } });
  return role === "admin";
}

// Runs after requireAuth (it needs req.userId) in front of every /api/admin
// route, in server/src/index.js: anyone who isn't an admin gets 403.
export async function requireAdmin(req, res, next) {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json(fail(req, "notLoggedIn"));
  if (!(await checkAdmin(user))) return res.status(403).json(fail(req, "adminOnly"));
  next();
}

// The listed emails that have no account, from the listed emails and the
// emails of the accounts that matched them.
export function listedWithoutAccount(listed, accountEmails) {
  const have = new Set(accountEmails.map(normalizeEmail));
  return [...listed].filter((email) => !have.has(email));
}

// At startup: one warning per ADMIN_EMAILS entry with no account. Signup
// refuses those emails, so nobody can claim them, but the entry does nothing
// until it is removed (create the account first, then list it).
export async function warnAboutAdminEmails(log = console.warn) {
  const listed = adminEmails();
  if (listed.size === 0) return;
  const accounts = await prisma.user.findMany({
    where: { OR: [...listed].map((email) => ({ email: { equals: email, mode: "insensitive" } })) },
    select: { email: true },
  });
  for (const email of listedWithoutAccount(listed, accounts.map((a) => a.email))) {
    log(
      `ADMIN_EMAILS lists ${email}, but no account has that email. It grants nothing and signup with it is refused. ` +
        "Only list emails that already have an account."
    );
  }
}

// The Members list: email, signup date and last active, nothing else. An
// account that hasn't been back since "last active" started being recorded
// shows its newest sign-in instead (null when it has none). Most recently
// active first; never-seen accounts last, newest signup first.
export function memberRows(users) {
  const rows = users.map((user) => ({
    email: user.email,
    signedUpAt: user.createdAt,
    lastActiveAt: user.lastActiveAt ?? user.sessions?.[0]?.createdAt ?? null,
  }));
  const time = (date) => (date ? new Date(date).getTime() : -Infinity);
  return rows.sort((a, b) => time(b.lastActiveAt) - time(a.lastActiveAt) || time(b.signedUpAt) - time(a.signedUpAt));
}
