import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword, createSession, destroySession, requireAuth } from "../lib/auth.js";
import { seedPlaceholderRecipesForUser } from "../lib/placeholders.js";

export const authRouter = Router();

function serializeUser(user) {
  return { id: user.id, email: user.email, name: user.name };
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
    return res.status(400).json({ error: "email and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  const isFirstUser = (await prisma.user.count()) === 0;
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email: normalizedEmail, name: name?.trim() || null, passwordHash },
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
      prisma.flyerPage.updateMany({ where: { userId: null }, data: { userId: user.id } }),
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
    return res.status(400).json({ error: "email and password are required" });
  }
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: "Incorrect email or password" });
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
  if (!user) return res.status(401).json({ error: "Not logged in" });
  res.json(serializeUser(user));
});
