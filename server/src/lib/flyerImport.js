// Imports this week's flyers for an account: Flipp first (every item from
// the chosen stores' flyers), Le Rabais as the fallback when Flipp can't
// be read. Runs on demand (Flyers -> Import now) and on its own each week
// (see runDueImports and startFlyerScheduler below).
import { prisma } from "./prisma.js";
import { fetchFlippDeals, isValidPostalCode, normalizePostalCode } from "./flipp.js";
import { mapPastWeeks, mapToFlyerDeals, parseLeRabaisMarkdown } from "./leRabais.js";
import { refreshBaselinesIfDue } from "./baselines.js";

export const FLIPP_SOURCE = "Flipp";
export const LE_RABAIS_SOURCE = "Le Rabais";
const leRabaisUrl = () => process.env.LE_RABAIS_URL || "https://lerabais.com/Liste/Tableau.md";
// Le Rabais only publishes this one Montreal postal code.
const LE_RABAIS_POSTAL_CODE = "H2T2S3";
const DEFAULT_STORES = ["Metro", "IGA", "Maxi", "Super C", "Provigo"];

const RETRY_AFTER_MS = 3 * 60 * 60 * 1000;

function parseStores(json) {
  try {
    const list = JSON.parse(json);
    return Array.isArray(list) ? list.filter((s) => typeof s === "string" && s.trim()) : [];
  } catch {
    return [];
  }
}

export function serializeSettings(row) {
  return {
    postalCode: row.postalCode,
    stores: parseStores(row.stores),
    autoImport: row.autoImport,
    lastImportAt: row.lastImportAt,
    lastImportOk: row.lastImportOk,
    lastImportCount: row.lastImportCount,
    lastImportSource: row.lastImportSource,
    lastImportMessage: row.lastImportMessage,
    lastSuccessAt: row.lastSuccessAt,
  };
}

// Every account gets auto-import on the first time it opens Flyers.
export async function getOrCreateSettings(userId) {
  return prisma.flyerSettings.upsert({
    where: { userId },
    create: { userId, stores: JSON.stringify(DEFAULT_STORES) },
    update: {},
  });
}

export async function updateSettings(userId, { postalCode, stores, autoImport }) {
  const data = {};
  if (postalCode !== undefined) {
    if (!isValidPostalCode(postalCode)) {
      const err = new Error("That doesn't look like a Canadian postal code (e.g. H2T 2S3).");
      err.status = 400;
      throw err;
    }
    data.postalCode = normalizePostalCode(postalCode);
  }
  if (stores !== undefined) {
    if (!Array.isArray(stores)) {
      const err = new Error("stores must be a list of store names.");
      err.status = 400;
      throw err;
    }
    const clean = [...new Set(stores.map((s) => String(s).trim()).filter(Boolean))].slice(0, 20);
    data.stores = JSON.stringify(clean);
  }
  if (autoImport !== undefined) data.autoImport = !!autoImport;
  await getOrCreateSettings(userId);
  return prisma.flyerSettings.update({ where: { userId }, data });
}

// Writes one source's deals as this week's, keeping earlier weeks' as price
// history (isCurrent false) - see FlyerDeal.isCurrent. A Flipp import also
// retires the current Le Rabais rows for the same stores, so a store never
// shows twice.
async function saveCurrentDeals(userId, source, deals) {
  const stores = [...new Set(deals.map((d) => d.store))];
  const retire =
    source === FLIPP_SOURCE
      ? { userId, isCurrent: true, OR: [{ source: FLIPP_SOURCE }, { source: LE_RABAIS_SOURCE, store: { in: stores } }] }
      : { userId, isCurrent: true, source };
  // Deals imported earlier this same flyer week are replaced, not kept as
  // history - re-importing the same flyer would otherwise look like weeks
  // of prices.
  await prisma.$transaction([
    prisma.flyerDeal.deleteMany({ where: { ...retire, createdAt: { gte: latestFlyerStart() } } }),
    prisma.flyerDeal.updateMany({ where: retire, data: { isCurrent: false } }),
    ...(deals.length ? [prisma.flyerDeal.createMany({ data: deals.map((d) => ({ ...d, userId, source })) })] : []),
  ]);
  return stores;
}

export async function importFlipp(userId, settings, { fetchImpl = fetch } = {}) {
  const stores = parseStores(settings.stores);
  const result = await fetchFlippDeals({ postalCode: settings.postalCode, stores, fetchImpl });
  if (result.deals.length === 0) {
    const why = result.failed.length
      ? result.failed.join("; ")
      : result.flyers.length
        ? "the flyers had no priced items"
        : `no grocery flyers found near ${settings.postalCode}${stores.length ? ` for ${stores.join(", ")}` : ""}`;
    throw new Error(`Flipp: ${why}`);
  }
  const saved = await saveCurrentDeals(userId, FLIPP_SOURCE, result.deals);
  return { count: result.deals.length, photos: countPhotos(result.deals), stores: saved, failed: result.failed };
}

// This week's Le Rabais deals, plus any past week in its file that isn't
// stored yet (price history). Stores that already have this week's Flipp
// flyer are skipped so they don't show twice.
async function fetchLeRabais(fetchImpl) {
  let res;
  try {
    res = await fetchImpl(leRabaisUrl());
  } catch {
    throw new Error("couldn't connect to Le Rabais");
  }
  return res;
}

export async function importLeRabais(userId, { fetchImpl = fetch, today = new Date().toISOString().slice(0, 10) } = {}) {
  const res = await fetchLeRabais(fetchImpl);
  if (!res.ok) throw new Error(`Le Rabais answered ${res.status}`);
  const rows = parseLeRabaisMarkdown(await res.text());
  if (rows.length === 0) throw new Error("Le Rabais: no deals could be read - its format may have changed");

  const flippStores = new Set(
    (
      await prisma.flyerDeal.findMany({
        where: { userId, isCurrent: true, source: FLIPP_SOURCE },
        select: { store: true },
        distinct: ["store"],
      })
    ).map((r) => r.store)
  );
  const current = mapToFlyerDeals(rows, { postalCode: LE_RABAIS_POSTAL_CODE, today }).filter(
    (d) => !flippStores.has(d.store)
  );
  await saveCurrentDeals(userId, LE_RABAIS_SOURCE, current);
  const backfilled = await backfillLeRabais(userId, mapPastWeeks(rows, { postalCode: LE_RABAIS_POSTAL_CODE, today }));
  return { count: current.length, photos: countPhotos(current), backfilled, stores: [...new Set(current.map((d) => d.store))] };
}

const countPhotos = (deals) => deals.filter((d) => d.imageUrl).length;

// "812 items, 790 with photos" - so a week without photos shows up.
function photoNote({ count, photos }) {
  return `${count} item${count === 1 ? "" : "s"}, ${photos === count ? "all" : photos} with photos.`;
}

async function backfillLeRabais(userId, past) {
  if (past.length === 0) return 0;
  const since = new Date(Math.min(...past.map((d) => d.createdAt.getTime())));
  const existing = await prisma.flyerDeal.findMany({
    where: { userId, source: LE_RABAIS_SOURCE, createdAt: { gte: since } },
    select: { store: true, item: true, price: true, createdAt: true, validUntil: true },
  });
  const key = (d) => `${d.store}|${d.item}|${d.price}|${d.validUntil}`;
  const have = new Set(existing.map(key));
  const missing = past.filter((d) => !have.has(key(d)));
  if (missing.length) {
    await prisma.flyerDeal.createMany({
      data: missing.map((d) => ({ ...d, userId, source: LE_RABAIS_SOURCE, isCurrent: false })),
    });
  }
  return missing.length;
}

async function record(userId, patch) {
  const now = new Date();
  return prisma.flyerSettings.update({
    where: { userId },
    data: { lastImportAt: now, ...(patch.lastImportOk ? { lastSuccessAt: now } : {}), ...patch },
  });
}

// One account's import: Flipp, else Le Rabais, and the outcome saved on its
// settings for the Flyers screen.
export async function runImportForUser(userId, { fetchImpl = fetch } = {}) {
  const settings = await getOrCreateSettings(userId);
  try {
    const result = await importFlipp(userId, settings, { fetchImpl });
    const note = result.failed.length ? `Couldn't read: ${result.failed.join("; ")}` : null;
    // Past Le Rabais weeks are still worth having as history.
    await importLeRabaisHistoryQuietly(userId, fetchImpl);
    return serializeSettings(
      await record(userId, {
        lastImportOk: true,
        lastImportCount: result.count,
        lastImportSource: FLIPP_SOURCE,
        lastImportMessage: `${result.stores.join(", ")}: ${photoNote(result)}${note ? ` ${note}` : ""}`,
      })
    );
  } catch (flippErr) {
    try {
      const result = await importLeRabais(userId, { fetchImpl });
      return serializeSettings(
        await record(userId, {
          lastImportOk: true,
          lastImportCount: result.count,
          lastImportSource: LE_RABAIS_SOURCE,
          lastImportMessage: `Flipp couldn't be read (${flippErr.message.replace(/^Flipp: /, "")}), so this week's deals came from Le Rabais: ${photoNote(result)}`,
        })
      );
    } catch (rabaisErr) {
      return serializeSettings(
        await record(userId, {
          lastImportOk: false,
          lastImportCount: 0,
          lastImportSource: null,
          lastImportMessage: `Flipp: ${flippErr.message.replace(/^Flipp: /, "")}. Le Rabais: ${rabaisErr.message.replace(/^Le Rabais:? ?/, "")}.`.slice(0, 500),
        })
      );
    }
  }
}

async function importLeRabaisHistoryQuietly(userId, fetchImpl) {
  try {
    const res = await fetchLeRabais(fetchImpl);
    if (!res.ok) return;
    const today = new Date().toISOString().slice(0, 10);
    await backfillLeRabais(userId, mapPastWeeks(parseLeRabaisMarkdown(await res.text()), { postalCode: LE_RABAIS_POSTAL_CODE, today }));
  } catch {
    // History is a bonus; the import already succeeded.
  }
}

// Quebec grocery flyers turn over on Thursdays. The most recent Thursday
// 12:00 UTC (8 am in Montreal) at or before `now`.
export function latestFlyerStart(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  const back = (d.getUTCDay() - 4 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  if (d > now) d.setUTCDate(d.getUTCDate() - 7);
  return d;
}

// Due when auto-import is on, nothing has succeeded since this week's
// flyers came out, and the last attempt wasn't in the past 3 hours.
export function isImportDue(settings, now = new Date()) {
  if (!settings.autoImport) return false;
  const start = latestFlyerStart(now);
  if (settings.lastSuccessAt && new Date(settings.lastSuccessAt) >= start) return false;
  if (settings.lastImportAt && now - new Date(settings.lastImportAt) < RETRY_AFTER_MS) return false;
  return true;
}

let running = null;

// Every account whose import is due, one after another. Overlapping calls
// (the hourly timer and the cron ping at once) share the same run.
export function runDueImports({ now = new Date(), fetchImpl = fetch } = {}) {
  if (running) return running;
  running = (async () => {
    const all = await prisma.flyerSettings.findMany({ where: { autoImport: true } });
    const due = all.filter((s) => isImportDue(s, now));
    const results = [];
    for (const s of due) {
      const out = await runImportForUser(s.userId, { fetchImpl });
      results.push({ userId: s.userId, ok: out.lastImportOk, count: out.lastImportCount });
    }
    return { checked: all.length, ran: results.length, results };
  })().finally(() => {
    running = null;
  });
  return running;
}

// Checks once a minute after start-up, then hourly. On a host that sleeps
// when idle (Render's free tier) this only runs while the app is awake -
// the weekly GitHub Action (.github/workflows/flyer-import.yml) wakes it.
// FLYER_AUTO_IMPORT=off turns it off (the e2e tests do).
export function startFlyerScheduler() {
  if (String(process.env.FLYER_AUTO_IMPORT).toLowerCase() === "off") return;
  const tick = () =>
    Promise.all([
      runDueImports().catch((err) => {
        console.error("Flyer auto-import failed:", err);
      }),
      refreshBaselinesIfDue(),
    ]);
  setTimeout(tick, 60 * 1000).unref?.();
  setInterval(tick, 60 * 60 * 1000).unref?.();
}
