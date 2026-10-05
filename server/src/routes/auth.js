import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword, createSession, destroySession, requireAuth } from "../lib/auth.js";
import { seedPlaceholderRecipesForUser } from "../lib/placeholders.js";
import { sendPasswordResetEmail } from "../lib/mailer.js";
import { fail, langOf, msg, normalizeLang } from "../lib/i18n.js";
import { cleanWeekendDays, cleanWeekendFlag, DEFAULT_WEEKEND_DAYS } from "../lib/weekendDays.js";

export const authRouter = Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
// Guards against a rapid double-click (or a deliberate spam-click) filling
// someone's inbox with reset emails - not a real rate limit, just avoids the
// obviously wasteful case of sending several links within the same minute.
const RESET_REQUEST_COOLDOWN_MS = 2 * 60 * 1000;

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: user.locale || null,
    weekendDays: user.weekendDays ?? DEFAULT_WEEKEND_DAYS,
    weekendOn: user.weekendOn ?? true,
    weekendEve: user.weekendEve ?? true,
  };
}

// POST /api/auth/signup { email, password, name? } - creates an account.
// The very first account ever created automatically inherits every
// pre-existing row (userId still null, from this app's single-user era,
// before accounts existed) rather than leaving that data stranded and
// invisible to everyone - see the backfill below. Every signup after that
// just starts empty, same as any normal new account.
authRouter.post("/signup", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !email.trim() || !password) {
    return res.status(400).json(fail(req, "emailPasswordRequired"));
  }
  if (password.length < 8) {
    return res.status(400).json(fail(req, "passwordTooShort"));
  }
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json(fail(req, "emailTaken"));
  }

  const isFirstUser = (await prisma.user.count()) === 0;
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email: normalizedEmail, name: name?.trim() || null, passwordHash, locale: normalizeLang(req.body.locale) || langOf(req) },
  });

  if (isFirstUser) {
    await prisma.$transaction([
      prisma.recipe.updateMany({ where: { userId: null }, data: { userId: user.id } }),
      prisma.recipeCategory.updateMany({ where: { userId: null }, data: { userId: user.id } }),
      prisma.pantryStaple.updateMany({ where: { userId: null }, data: { userId: user.id } }),
      prisma.grocerySection.updateMany({ where: { userId: null }, data: { userId: user.id } }),
      prisma.groceryAssignment.updateMany({ where: { userId: null }, data: { userId: user.id } }),
      prisma.groceryCheckedItem.updateMany({ where: { userId: null }, data: { userId: user.id } }),
      prisma.flyerDeal.updateMany({ where: { userId: null }, data: { userId: user.id } }),
      prisma.plannerEntry.updateMany({ where: { userId: null }, data: { userId: user.id } }),
    ]);
  }
  // Idempotent (checks for an existing row before creating each one), so
  // this is a safe no-op for the first user if the backfill above already
  // gave them pre-existing placeholder recipes, and correctly creates a
  // fresh set for every other case (first user with no legacy data at all,
  // or any later signup).
  await seedPlaceholderRecipesForUser(user.id);

  await createSession(res, user.id);
  res.status(201).json(serializeUser(user));
});

// POST /api/auth/login { email, password }
authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json(fail(req, "emailPasswordRequired"));
  }
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json(fail(req, "wrongLogin"));
  }
  await createSession(res, user.id);
  res.json(serializeUser(user));
});

// POST /api/auth/logout
authRouter.post("/logout", async (req, res) => {
  await destroySession(req, res);
  res.status(204).send();
});

// GET /api/auth/me - the logged-in user, or 401 if not logged in. Used on
// every app load to decide whether to show the login form or the app.
authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json(fail(req, "notLoggedIn"));
  res.json(serializeUser(user));
});

// PATCH /api/auth/me { locale?: "fr" | "en", weekendDays?: [0-6, ...],
// weekendOn?: boolean, weekendEve?: boolean } - the account's language (for
// the app on every device and for the emails it sends) and the Planner's
// weekend: its days, whether it is shown, and whether it takes in the supper
// before its first day.
authRouter.patch("/me", requireAuth, async (req, res) => {
  const data = {};
  if (req.body?.locale !== undefined) {
    const locale = normalizeLang(req.body.locale);
    if (!locale || String(req.body.locale).length > 5) return res.status(400).json(fail(req, "badLocale"));
    data.locale = locale;
  }
  if (req.body?.weekendDays !== undefined) {
    const weekendDays = cleanWeekendDays(req.body.weekendDays);
    if (!weekendDays) return res.status(400).json(fail(req, "badWeekendDays"));
    data.weekendDays = weekendDays;
  }
  for (const key of ["weekendOn", "weekendEve"]) {
    if (req.body?.[key] === undefined) continue;
    const flag = cleanWeekendFlag(req.body[key]);
    if (flag === null) return res.status(400).json(fail(req, "badWeekendDays"));
    data[key] = flag;
  }
  if (Object.keys(data).length === 0) return res.status(400).json(fail(req, "badLocale"));
  const user = await prisma.user.update({ where: { id: req.userId }, data });
  res.json(serializeUser(user));
});

// POST /api/auth/forgot-password { email } - always responds the same way
// whether or not the email has an account, so this can't be used to check
// which emails are registered. Mailing the link (rather than returning it
// in the response) is what actually proves the requester owns that inbox.
authRouter.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email || !email.trim()) {
    return res.status(400).json(fail(req, "emailRequired"));
  }

  const genericResponse = () =>
    res.json({ message: msg(req, "resetSent") });

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return genericResponse();

  const recent = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, usedAt: null, createdAt: { gt: new Date(Date.now() - RESET_REQUEST_COOLDOWN_MS) } },
  });
  if (recent) return genericResponse();

  const token = await prisma.passwordResetToken.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const resetUrl = `${appUrl}/reset-password?token=${token.id}`;

  try {
    await sendPasswordResetEmail(user.email, resetUrl, user.locale || langOf(req));
  } catch (err) {
    console.error("Failed to send password reset email:", err.message);
    // Still a generic response - a delivery failure shouldn't tell an
    // outside caller anything about which emails exist.
  }

  genericResponse();
});

// POST /api/auth/reset-password { token, password } - the actual password
// change. Also signs out every existing session for the account: a
// password reset is exactly the moment someone might be recovering from a
// compromised account, so anything already logged in (possibly the
// attacker) shouldn't get to stay logged in past this point.
authRouter.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json(fail(req, "tokenPasswordRequired"));
  }
  if (password.length < 8) {
    return res.status(400).json(fail(req, "passwordTooShort"));
  }

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { id: token } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return res.status(400).json(fail(req, "resetInvalid"));
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: token }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: resetToken.userId } }),
  ]);

  res.json({ message: msg(req, "passwordUpdated") });
});
