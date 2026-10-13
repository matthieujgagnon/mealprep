import { daysBetween, quebecDay } from "./quebecDay.js";

// Inventory's "Recently removed" (« Récemment retirés »): what left Inventory in
// the last 7 Quebec days, and how. The Inventory row is deleted as it always was;
// a copy of it waits in PantryRemovedItem so Put back can restore it as it was
// (same id, shelf, amount, use-by date, photo and leftover link).

// How an item left: Used up, Tossed, Deleted (the pop-up's Remove), or Cooked
// ("I cooked this" took it out to zero). A planned leftover whose day passed and
// the recipe card's "I'm out of this" count as Used up.
export const REMOVED_HOW = ["consumed", "wasted", "deleted", "cooked"];

// Kept for 7 Quebec days: removed on Oct 13, it is listed until the end of Oct 20.
export const REMOVED_KEEP_DAYS = 7;

// The fields of an Inventory row that Put back needs, as plain JSON.
const FIELDS = ["id", "name", "core", "category", "quantity", "unit", "location", "purchasedAt", "expiresAt", "imageUrl", "isLeftover", "recipeId", "createdAt"];
export function snapshotOf(item) {
  const out = {};
  for (const key of FIELDS) {
    const value = item[key];
    out[key] = value instanceof Date ? value.toISOString() : value ?? null;
  }
  return out;
}

// Still listed: removed no more than REMOVED_KEEP_DAYS Quebec days before today.
export function stillKept(removedAt, now = new Date()) {
  return daysBetween(quebecDay(new Date(removedAt)), quebecDay(now)) <= REMOVED_KEEP_DAYS;
}

// Writes one entry per row that left Inventory (inside the caller's transaction,
// so the row and its entry go together). `logIds` maps a row id to the log line
// written for it. A row removed again replaces its older entry.
export async function recordRemoved(tx, userId, items, how, logIds = new Map()) {
  if (!REMOVED_HOW.includes(how) || items.length === 0) return;
  await tx.pantryRemovedItem.deleteMany({ where: { userId, itemId: { in: items.map((i) => i.id) } } });
  await tx.pantryRemovedItem.createMany({
    data: items.map((item) => ({ userId, itemId: item.id, item: snapshotOf(item), how, logId: logIds.get(item.id) ?? null })),
  });
}

// Deletes this user's entries older than 7 Quebec days, for good.
export async function forgetOldRemoved(prisma, userId, now = new Date()) {
  const rows = await prisma.pantryRemovedItem.findMany({ where: { userId }, select: { id: true, removedAt: true } });
  const old = rows.filter((r) => !stillKept(r.removedAt, now)).map((r) => r.id);
  if (old.length > 0) await prisma.pantryRemovedItem.deleteMany({ where: { id: { in: old }, userId } });
}

// The list Inventory shows: newest first, each with the row as it was.
export async function listRemoved(prisma, userId, now = new Date()) {
  await forgetOldRemoved(prisma, userId, now);
  const rows = await prisma.pantryRemovedItem.findMany({ where: { userId }, orderBy: { removedAt: "desc" } });
  return rows.map((r) => ({ id: r.id, itemId: r.itemId, how: r.how, removedAt: r.removedAt, item: r.item }));
}
