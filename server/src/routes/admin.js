import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { memberRows } from "../lib/admin.js";
import { fail } from "../lib/i18n.js";
import { cleanInviteInput, expiryDate, generateCode, inviteRow } from "../lib/invites.js";
import {
  DEFAULT_AI_DAILY_LIMIT,
  MAX_AI_DAILY_LIMIT,
  aiDay,
  aiUsageRows,
  cleanAiLimit,
  getAiLimit,
  setAiLimit,
} from "../lib/aiLimit.js";

// Admin only. index.js mounts this router behind requireAuth and requireAdmin,
// so every route here (and any added later) refuses non-admins with 403
// before it runs.
export const adminRouter = Router();

// GET /api/admin/members - every account's email, signup date and last
// active (see memberRows in lib/admin.js). No other personal data.
adminRouter.get("/members", async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      email: true,
      createdAt: true,
      lastActiveAt: true,
      sessions: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  res.json({ members: memberRows(users) });
});

// GET /api/admin/invites - every invite code, newest first: the code, its
// note, uses, expiry, whether it is switched on, where it stands, and the
// emails that signed up with it (see inviteRow in lib/invites.js).
adminRouter.get("/invites", async (req, res) => {
  const invites = await prisma.inviteCode.findMany({
    orderBy: { createdAt: "desc" },
    include: { users: { select: { email: true }, orderBy: { createdAt: "asc" } } },
  });
  res.json({ invites: invites.map((invite) => inviteRow(invite)) });
});

// POST /api/admin/invites { note?, maxUses?, expiresInDays? } - makes a code.
// The server picks the code itself; maxUses 1 (the default) is single-use;
// no expiresInDays means it never expires.
adminRouter.post("/invites", async (req, res) => {
  const input = cleanInviteInput(req.body);
  if (input.error) return res.status(400).json(fail(req, input.error));
  const expiresAt = expiryDate(input.expiresInDays);

  // A clash with an existing code is a one-in-a-billion chance; try again.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const invite = await prisma.inviteCode.create({
        data: { code: generateCode(), note: input.note, maxUses: input.maxUses, expiresAt },
        include: { users: { select: { email: true } } },
      });
      return res.status(201).json(inviteRow(invite));
    } catch (err) {
      if (err.code !== "P2002") throw err;
    }
  }
  res.status(500).json(fail(req, "generic"));
});

// PATCH /api/admin/invites/:id { active } - switches a code off (or back on).
// Signup refuses a code that is off; accounts already made with it stay.
adminRouter.patch("/invites/:id", async (req, res) => {
  if (typeof req.body?.active !== "boolean") return res.status(400).json(fail(req, "required", { fields: "active" }));
  const found = await prisma.inviteCode.findUnique({ where: { id: req.params.id } });
  if (!found) return res.status(404).json(fail(req, "notFound.invite"));
  const invite = await prisma.inviteCode.update({
    where: { id: found.id },
    data: { active: req.body.active },
    include: { users: { select: { email: true }, orderBy: { createdAt: "asc" } } },
  });
  res.json(inviteRow(invite));
});

// GET /api/admin/ai-usage - the daily limit and what each account has used of
// it today (the Quebec calendar day, see lib/aiLimit.js): email and count.
adminRouter.get("/ai-usage", async (req, res) => {
  const day = aiDay();
  const [limit, users, usage] = await Promise.all([
    getAiLimit(),
    prisma.user.findMany({ select: { id: true, email: true } }),
    prisma.aiUsage.findMany({ where: { day }, select: { userId: true, count: true } }),
  ]);
  res.json({ day, limit, defaultLimit: DEFAULT_AI_DAILY_LIMIT, maxLimit: MAX_AI_DAILY_LIMIT, members: aiUsageRows(users, usage) });
});

// PUT /api/admin/ai-limit { limit } - the most Gemini-backed actions (flyer
// and receipt reading) one account can do in a day. 0 pauses them for all.
adminRouter.put("/ai-limit", async (req, res) => {
  const limit = cleanAiLimit(req.body?.limit);
  if (limit === null) return res.status(400).json(fail(req, "aiLimitBad"));
  await setAiLimit(limit);
  res.json({ limit });
});
