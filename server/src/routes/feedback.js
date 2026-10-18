import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail, langOf } from "../lib/i18n.js";
import { accountOverFeedbackLimit, cleanFeedbackInput, notifyFeedback } from "../lib/feedback.js";

// The Feedback form. index.js mounts this behind requireAuth, so only a signed-in
// account can send (401 otherwise). Matt reads what is sent in Admin's Feedback
// inbox (routes/admin.js).
export const feedbackRouter = Router();

// POST /api/feedback { message, kind, page, locale, device, screen, appVersion,
// errorName? } - saves one feedback and, when FEEDBACK_EMAIL_TO is set, tells
// Matt by email. 400 for no words, too many or an unknown kind; 429 when the
// account has sent too much (lib/feedback.js). The browser comes from the
// request, the time from the server. The email goes out after the answer, so the
// tester never waits on it, and a failed email never fails the feedback.
feedbackRouter.post("/", async (req, res) => {
  const input = cleanFeedbackInput(req.body, { userAgent: req.get("user-agent"), lang: langOf(req) });
  if (input.error) return res.status(400).json(fail(req, input.error, input.vars));

  const limited = await accountOverFeedbackLimit(req.userId);
  if (limited) return res.status(429).json(fail(req, limited));

  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } });
  const row = await prisma.feedback.create({ data: { ...input.data, userId: req.userId } });
  res.status(201).json({ id: row.id });

  notifyFeedback(row, user?.email ?? "");
});
