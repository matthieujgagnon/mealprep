import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";

const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Creates a session row and sets the cookie that identifies it - the cookie
// holds nothing but the session's own id (a cuid, long/unguessable enough to
// serve as the bearer token itself, no separate signing needed), so a
// session can be revoked at any time by just deleting its row.
export async function createSession(res, userId) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({ data: { userId, expiresAt } });
  res.cookie(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });
  return session;
}

export async function destroySession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await prisma.session.deleteMany({ where: { id: token } });
  res.clearCookie(SESSION_COOKIE);
}

// Applied to every data route (everything except /api/auth/* and
// /api/health) - looks up the session cookie, attaches req.userId, or 401s.
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: "Not logged in" });

  const session = await prisma.session.findUnique({ where: { id: token } });
  if (!session || session.expiresAt < new Date()) {
    res.clearCookie(SESSION_COOKIE);
    return res.status(401).json({ error: "Session expired - please log in again" });
  }

  req.userId = session.userId;
  next();
}
