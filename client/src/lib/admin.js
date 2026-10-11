// Plain logic for the Admin page (components/Admin.jsx).

// The Admin page is the one page with its own address. A trailing slash is
// the same page.
export const ADMIN_PATH = "/admin";

export function isAdminPath(pathname) {
  return String(pathname || "").replace(/\/+$/, "") === ADMIN_PATH;
}

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
