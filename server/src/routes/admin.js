import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { memberRows } from "../lib/admin.js";
import { makeAdminResetLink } from "../lib/resetLink.js";
import { fail } from "../lib/i18n.js";
import { FEEDBACK_LIST_LIMIT, feedbackRow } from "../lib/feedback.js";
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

// GET /api/admin/members - every account's id, email, signup date and last
// active (see memberRows in lib/admin.js). No other personal data.
adminRouter.get("/members", async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      createdAt: true,
      lastActiveAt: true,
      sessions: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  res.json({ members: memberRows(users) });
});

// POST /api/admin/members/:id/reset-link - a one-time link for that account to
// choose a new password: it works once, expires in an hour and replaces any
// link the account hadn't used yet (lib/resetLink.js). It is the same reset page
// and rules as the emailed link, for when email can't be sent. The link is in the
// answer only; it is not stored anywhere an admin can read it back, and the log
// says who it was made for, never the link.
adminRouter.post("/members/:id/reset-link", async (req, res) => {
  const member = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, email: true } });
  if (!member) return res.status(404).json(fail(req, "notFound.member"));
  const { url, expiresAt } = await makeAdminResetLink(member.id, { req });
  console.log(`Admin ${req.userId} made a reset link for ${member.email}.`);
  res.status(201).json({ url, expiresAt });
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

// GET /api/admin/feedback - what testers sent, newest first (the latest
// FEEDBACK_LIST_LIMIT), with who sent it and the details the app attached, and
// how many of all of it are not done yet (lib/feedback.js).
adminRouter.get("/feedback", async (req, res) => {
  const [rows, total, notDone] = await Promise.all([
    prisma.feedback.findMany({
      orderBy: { createdAt: "desc" },
      take: FEEDBACK_LIST_LIMIT,
      include: { user: { select: { email: true } } },
    }),
    prisma.feedback.count(),
    prisma.feedback.count({ where: { doneAt: null } }),
  ]);
  res.json({ items: rows.map(feedbackRow), total, notDone });
});

// PATCH /api/admin/feedback/:id { done } - Matt's Done tick (and un-tick). It is
// the only thing about a feedback that can change.
adminRouter.patch("/feedback/:id", async (req, res) => {
  if (typeof req.body?.done !== "boolean") return res.status(400).json(fail(req, "required", { fields: "done" }));
  const found = await prisma.feedback.findUnique({ where: { id: req.params.id } });
  if (!found) return res.status(404).json(fail(req, "notFound.feedback"));
  const row = await prisma.feedback.update({
    where: { id: found.id },
    data: { doneAt: req.body.done ? found.doneAt ?? new Date() : null },
    include: { user: { select: { email: true } } },
  });
  res.json(feedbackRow(row));
});
