import { prisma } from "./prisma.js";
import { normalizeLang } from "./i18n.js";
import { quebecDay } from "./quebecDay.js";
import { sendFeedbackEmail } from "./mailer.js";

// The Feedback form (routes/feedback.js) and the Admin Feedback inbox
// (routes/admin.js). A tester sends words and a kind; the app adds the page,
// language, phone or computer, window size, app version and (from the crash
// screen or an error message) the error's name. The browser is read here from
// the request's own User-Agent. Nothing else is stored: no screenshots, no
// recipe or Inventory content.

export const FEEDBACK_KINDS = ["wrong", "idea", "other"];
export const FEEDBACK_MAX_LENGTH = 2000;

// How much one account may send: 5 in any 10 minutes and 30 in a Quebec day.
export const FEEDBACK_BURST = { count: 5, windowMs: 10 * 60 * 1000 };
export const FEEDBACK_PER_DAY = 30;

// The Feedback inbox lists this many per page, newest first; "Show older" asks for
// the next page (feedbackCursor), on both tabs.
export const FEEDBACK_LIST_LIMIT = 200;

// The inbox has two boxes: what Matt has not archived and what he has. Archiving only
// sets archivedAt (Done is separate), so nothing is ever deleted by it.
export const FEEDBACK_BOXES = ["inbox", "archive"];

// The most ids one "Back to inbox" (the Undo of "Archive all done") may name.
export const FEEDBACK_MAX_IDS = 10000;

// Postgres text can't hold a NUL, and other control characters are only noise
// (a new line and a tab are kept).
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const DEVICES = ["phone", "computer"];
const SCREEN = /^\d{2,5}x\d{2,5}$/;
const PAGE = /^[a-z][a-z0-9-]{0,39}$/;
const VERSION = /^[A-Za-z0-9._-]{1,20}$/;
// An error's name ("TypeError", "ChunkLoadError"), never its message.
const ERROR_NAME = /^[A-Za-z][A-Za-z0-9_$.-]{0,59}$/;

// The words, cleaned: new lines as \n, control characters gone, no blank edges.
export function cleanMessage(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .trim();
}

// What the form sent, checked and cleaned. { data } or { error } (a server
// message key). The details are never refused: one that doesn't look right is
// stored as "unknown" (or left out), so a feedback is never lost over a detail.
export function cleanFeedbackInput(body, { userAgent = "", lang = "fr" } = {}) {
  const input = body && typeof body === "object" ? body : {};
  const message = cleanMessage(input.message);
  if (!message) return { error: "feedbackRequired" };
  if (message.length > FEEDBACK_MAX_LENGTH) return { error: "feedbackTooLong", vars: { max: FEEDBACK_MAX_LENGTH } };
  if (!FEEDBACK_KINDS.includes(input.kind)) return { error: "feedbackBadKind" };

  const text = (value, re) => (typeof value === "string" && re.test(value) ? value : "unknown");
  return {
    data: {
      kind: input.kind,
      message,
      page: text(input.page, PAGE),
      locale: normalizeLang(input.locale) || normalizeLang(lang) || "fr",
      device: DEVICES.includes(input.device) ? input.device : "unknown",
      screen: text(input.screen, SCREEN),
      browser: browserLabel(userAgent),
      appVersion: text(input.appVersion, VERSION),
      errorName: typeof input.errorName === "string" && ERROR_NAME.test(input.errorName) ? input.errorName : null,
    },
  };
}

// "Safari 17 on iOS": the browser's own name and main version, and the system,
// from a User-Agent. Short on purpose; the full text is never kept.
export function browserLabel(userAgent) {
  const ua = String(userAgent || "");
  const first = (...patterns) => {
    for (const [name, re] of patterns) {
      const match = ua.match(re);
      if (match) return `${name} ${match[1]}`;
    }
    return null;
  };
  // Order matters: Edge, Opera and Chrome on iOS all also say "Chrome" or "Safari". Chrome
  // without a window says "HeadlessChrome", so it has no word edge before it.
  const browser =
    first(["Edge", /\bEdg(?:e|A|iOS)?\/(\d+)/], ["Opera", /\bOPR\/(\d+)/], ["Firefox", /\b(?:Firefox|FxiOS)\/(\d+)/], ["Chrome", /(?:Chrome|CriOS)\/(\d+)/], [
      "Safari",
      /\bVersion\/(\d+)[\d.]*.*\bSafari\//,
    ]) || "Unknown browser";
  const system = /\b(iPhone|iPad|iPod)\b/.test(ua)
    ? "iOS"
    : /\bAndroid\b/.test(ua)
      ? "Android"
      : /\bCrOS\b/.test(ua)
        ? "ChromeOS"
        : /\bWindows\b/.test(ua)
          ? "Windows"
          : /\bMac OS X\b/.test(ua)
            ? "macOS"
            : /\bLinux\b/.test(ua)
              ? "Linux"
              : null;
  return (system ? `${browser} on ${system}` : browser).slice(0, 80);
}

// Whether the account has sent too much, from the times it sent its recent
// feedback. null when it may send, else the message key to answer with.
// `times` is every send of the last day and a half; the rest is counted here.
export function feedbackLimitHit(times, now = new Date()) {
  const stamps = times.map((time) => new Date(time).getTime());
  const burst = stamps.filter((at) => now.getTime() - at < FEEDBACK_BURST.windowMs).length;
  if (burst >= FEEDBACK_BURST.count) return "feedbackBusy";
  const today = quebecDay(now);
  const day = stamps.filter((at) => quebecDay(new Date(at)) === today).length;
  if (day >= FEEDBACK_PER_DAY) return "feedbackDaily";
  return null;
}

const DAY_AND_A_HALF_MS = 36 * 60 * 60 * 1000;

// Reads the account's recent sends and says whether it has hit a limit. Counted
// from the Feedback table itself, so a restart (or the free server sleeping)
// never resets it.
export async function accountOverFeedbackLimit(userId, now = new Date()) {
  const recent = await prisma.feedback.findMany({
    where: { userId, createdAt: { gte: new Date(now.getTime() - DAY_AND_A_HALF_MS) } },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
    take: FEEDBACK_PER_DAY + 5,
  });
  return feedbackLimitHit(
    recent.map((row) => row.createdAt),
    now
  );
}

// What the list asked for: { box, cursor } or { error, vars } (a server message key).
// `box` is "inbox" (the default) or "archive"; `before` is the cursor of the last row
// of the page already shown (feedbackCursor), for the next, older page.
export function cleanFeedbackListQuery(query) {
  const input = query && typeof query === "object" ? query : {};
  const box = input.box ?? "inbox";
  if (!FEEDBACK_BOXES.includes(box)) return { error: "required", vars: { fields: "box" } };
  if (input.before === undefined) return { box, cursor: null };
  const cursor = parseFeedbackCursor(input.before);
  if (!cursor) return { error: "required", vars: { fields: "before" } };
  return { box, cursor };
}

// Where a page ends, as text the client hands back as `before`: the sent time and the
// id (two rows can share a millisecond), so the next page starts exactly after it.
export function feedbackCursor(row) {
  return `${row.createdAt.toISOString()}|${row.id}`;
}

const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([A-Za-z0-9_-]{1,40})$/;

// The time and id inside a cursor, or null when it isn't one.
export function parseFeedbackCursor(value) {
  const match = CURSOR.exec(typeof value === "string" ? value : "");
  if (!match) return null;
  const createdAt = new Date(match[1]);
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: match[2] };
}

// Newest sent first; the id keeps rows with the same time in one fixed order.
export const FEEDBACK_ORDER = [{ createdAt: "desc" }, { id: "desc" }];

// The rows of one box, or only those older than the cursor.
export function feedbackListWhere(box, cursor) {
  const where = { archivedAt: box === "archive" ? { not: null } : null };
  if (cursor) where.OR = [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }];
  return where;
}

// The numbers on the tabs and the "to do" pill, always over everything (never just the
// page on screen): how many are in the inbox, how many in the archive, and how many
// of the inbox are not done yet. An archived row never counts as "to do".
export async function feedbackCounts() {
  const [inbox, archive, notDone] = await Promise.all([
    prisma.feedback.count({ where: { archivedAt: null } }),
    prisma.feedback.count({ where: { archivedAt: { not: null } } }),
    prisma.feedback.count({ where: { archivedAt: null, doneAt: null } }),
  ]);
  return { inbox, archive, notDone };
}

// One Feedback row as the inbox shows it (email: who sent it).
export function feedbackRow(row) {
  return {
    id: row.id,
    email: row.user?.email ?? null,
    kind: row.kind,
    message: row.message,
    page: row.page,
    locale: row.locale,
    device: row.device,
    screen: row.screen,
    browser: row.browser,
    appVersion: row.appVersion,
    errorName: row.errorName,
    createdAt: row.createdAt,
    doneAt: row.doneAt,
    archivedAt: row.archivedAt,
  };
}

// Tells Matt by email, when FEEDBACK_EMAIL_TO is set. Never throws: the feedback
// is already saved, and the inbox has it whether or not the email goes out.
// Resolves to whether an email was sent.
export async function notifyFeedback(row, senderEmail, { to = process.env.FEEDBACK_EMAIL_TO, send = sendFeedbackEmail, log = console } = {}) {
  const address = String(to ?? "").trim();
  if (!address) return false;
  try {
    // Written in the language of the account that owns that address, else French.
    const owner = await prisma.user.findFirst({ where: { email: { equals: address, mode: "insensitive" } }, select: { locale: true } });
    await send({ to: address, row, senderEmail, lang: owner?.locale === "en" ? "en" : "fr" });
    return true;
  } catch (err) {
    log.error("Feedback email not sent:", err.message);
    return false;
  }
}
