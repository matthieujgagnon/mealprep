import { prisma } from "./prisma.js";
import { fail } from "./i18n.js";

// A daily limit on the actions that call Gemini, per account: reading a flyer
// file (routes/flyers.js) and reading a receipt (routes/receipts.js). Each
// costs money on the app's Gemini key, so an account can only do so many a
// day. Matt sets the number in Admin (AI usage); AppSettings holds it.

// 10 a day: a week's flyers (a handful of stores) and the receipts after the
// shopping fit easily, while one account can't run up a bill in a day.
export const DEFAULT_AI_DAILY_LIMIT = 10;
export const MAX_AI_DAILY_LIMIT = 1000;

// "Today" is the Quebec calendar day, not the server's (UTC), so the count
// starts again at local midnight.
const TIME_ZONE = "America/Toronto";
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export function aiDay(now = new Date()) {
  const part = (type) => dayFormat.formatToParts(now).find((p) => p.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// The limit Matt chose, or the default when he never has.
export async function getAiLimit() {
  const settings = await prisma.appSettings.findUnique({ where: { id: "app" } });
  return settings?.aiDailyLimit ?? DEFAULT_AI_DAILY_LIMIT;
}

export async function setAiLimit(limit) {
  await prisma.appSettings.upsert({
    where: { id: "app" },
    update: { aiDailyLimit: limit },
    create: { id: "app", aiDailyLimit: limit },
  });
}

// A limit typed in Admin: a whole number from 0 (pauses AI reading for
// everyone) to 1000, else null.
export function cleanAiLimit(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_AI_DAILY_LIMIT ? value : null;
}

// Takes one of the account's readings for today before Gemini is called.
// Resolves { ok: true, limit, day } when there was one left, else
// { ok: false, paused, limit, day }. Taking is one conditional update, so a
// burst of requests sent at once can't get past the limit.
export async function takeAiUse(userId, now = new Date()) {
  const limit = await getAiLimit();
  const day = aiDay(now);
  if (limit <= 0) return { ok: false, paused: true, limit, day };
  for (let attempt = 0; attempt < 2; attempt++) {
    const bumped = await prisma.aiUsage.updateMany({
      where: { userId, day, count: { lt: limit } },
      data: { count: { increment: 1 } },
    });
    if (bumped.count === 1) return { ok: true, limit, day, userId };
    try {
      await prisma.aiUsage.create({ data: { userId, day, count: 1 } });
      return { ok: true, limit, day, userId };
    } catch (err) {
      // The row exists: either it is at the limit, or another request made
      // it a moment ago. Try the update once more.
      if (err.code !== "P2002") throw err;
    }
  }
  return { ok: false, paused: false, limit, day };
}

// Gives a taken reading back. Only when Gemini didn't answer because of its
// own side (our key refused, it is busy or down, the connection dropped): that
// isn't the member's reading. A file Gemini rejected as unreadable (400) still
// counts, so failing requests can't be sent for ever.
export function shouldGiveBack(err) {
  const status = err?.status;
  return status === undefined || status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
}

// Runs the Gemini call for a taken reading: if Gemini fails on its own side,
// the reading is given back (see shouldGiveBack), and the error goes on to the
// route as before.
export async function callGemini(use, call) {
  try {
    return await call();
  } catch (err) {
    if (shouldGiveBack(err)) await giveBackAiUse(use);
    throw err;
  }
}

export async function giveBackAiUse(use) {
  await prisma.aiUsage.updateMany({
    where: { userId: use.userId, day: use.day, count: { gt: 0 } },
    data: { count: { decrement: 1 } },
  });
}

// The 429 answer for a refused reading, in the reader's language.
export function aiLimitFailure(req, use) {
  return use.paused
    ? fail(req, "aiPaused", undefined, { limit: use.limit })
    : fail(req, "aiLimit", { limit: use.limit }, { limit: use.limit });
}

// Admin's AI usage rows: every account's email and what it used on the day,
// most used first, then by email.
export function aiUsageRows(users, usage) {
  const used = new Map(usage.map((row) => [row.userId, row.count]));
  return users
    .map((user) => ({ email: user.email, used: used.get(user.id) ?? 0 }))
    .sort((a, b) => b.used - a.used || a.email.localeCompare(b.email));
}
