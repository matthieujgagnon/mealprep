// Plain logic for the Admin page (components/Admin.jsx).

// The Admin pages are the only pages with their own address: Admin, and the
// Feedback inbox under it. A trailing slash is the same page.
export const ADMIN_PATH = "/admin";
export const FEEDBACK_ADMIN_PATH = "/admin/feedback";

const trimmed = (pathname) => String(pathname || "").replace(/\/+$/, "");

export function isAdminPath(pathname) {
  return trimmed(pathname) === ADMIN_PATH;
}

export function isFeedbackAdminPath(pathname) {
  return trimmed(pathname) === FEEDBACK_ADMIN_PATH;
}

// The tab an address opens: "admin", "feedback-inbox" or null for any other.
export function adminTabFor(pathname) {
  if (isAdminPath(pathname)) return "admin";
  if (isFeedbackAdminPath(pathname)) return "feedbackInbox";
  return null;
}

// The address a tab lives at: "/admin", "/admin/feedback" or "/" for the rest.
export function pathForTab(tab) {
  if (tab === "admin") return ADMIN_PATH;
  if (tab === "feedbackInbox") return FEEDBACK_ADMIN_PATH;
  return "/";
}

// The Feedback inbox: the pill tone of each kind, and the dictionary key a stored
// page name ("planner") is written under ("app.nav.planner"); null for a page the
// app doesn't know, which the inbox shows as it was stored.
export const KIND_TONES = { wrong: "pink", idea: "yellow", other: "canvas" };
const PAGE_KEYS = {
  home: "app.nav.home",
  collection: "app.nav.recipes",
  planner: "app.nav.planner",
  makeable: "app.nav.makeable",
  grocery: "app.nav.grocery",
  flyers: "app.nav.flyers",
  inventory: "app.nav.inventory",
  help: "app.help",
  admin: "same.admin",
  feedbackInbox: "admin.feedback.title",
};
export const pageKey = (page) => PAGE_KEYS[page] || null;

// How a Members date reads: "today", "yesterday", "date" (then shown as a
// date) or "never" (no date). Days are the viewer's own calendar days.
export function dayKind(date, now = new Date()) {
  if (!date) return "never";
  const day = new Date(date);
  if (Number.isNaN(day.getTime())) return "never";
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(day)) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return "date";
}

// The choices when making an invite code: how many times it can be used and
// how many days it lasts (null = never expires). A new code starts as a
// single-use one that lasts two weeks.
export const INVITE_USES = [1, 3, 5, 10];
export const INVITE_DAYS = [7, 14, 30, null];
export const DEFAULT_INVITE_USES = 1;
export const DEFAULT_INVITE_DAYS = 14;

// The daily limit typed in AI usage, as a whole number from 0 to `max`, else
// null. The server checks it again.
export function parseAiLimit(text, max = 1000) {
  const trimmed = String(text ?? "").trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const limit = Number(trimmed);
  return limit <= max ? limit : null;
}

// Whether an account has used up its day. With the limit at 0 nobody can
// read, which the page says once instead of marking every account.
export function limitReached(used, limit) {
  return limit > 0 && used >= limit;
}

// The Pill tone of a code's state: green while it can be used, ink once
// used up, pink when it has run out of time, dashed when switched off.
export const INVITE_TONES = { active: "green", used: "ink", expired: "pink", off: "dash" };

// Codes that can still be used, for the count next to the title.
export function usableCount(invites) {
  return invites.filter((invite) => invite.state === "active").length;
}

// Whether a code has a switch: only one that is on or off. A used or expired
// code is finished either way.
export function canSwitch(invite) {
  return invite.state === "active" || invite.state === "off";
}
