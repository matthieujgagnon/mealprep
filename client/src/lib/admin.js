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
