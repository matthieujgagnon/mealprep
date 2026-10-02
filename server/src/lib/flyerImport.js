// Imports this week's flyers for an account from Flipp: every item from the
// chosen stores' flyers. Each week's prices are kept, and those past weeks
// are the price history. Runs on demand (Flyers -> Import now) and on its
// own each week (see runDueImports and startFlyerScheduler below).
import { prisma } from "./prisma.js";
import { fetchFlippDeals, isValidPostalCode, normalizePostalCode, toMatchName } from "./flipp.js";
import { refreshBaselinesIfDue } from "./baselines.js";
import { findAmountOffSavedAsPrice, findPerLbSavedEach, HISTORY_WINDOW_MS } from "./importReport.js";

export const FLIPP_SOURCE = "Flipp";
// Deals an older version of the app took from Le Rabais (lerabais.com); a
// Flipp import retires any still marked current.
const LEGACY_LE_RABAIS_SOURCE = "Le Rabais";
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

// Writes this week's Flipp deals, keeping earlier weeks' as price history
// (isCurrent false) - see FlyerDeal.isCurrent.
async function saveCurrentDeals(userId, deals) {
  const stores = [...new Set(deals.map((d) => d.store))];
  const retire = { userId, isCurrent: true, source: { in: [FLIPP_SOURCE, LEGACY_LE_RABAIS_SOURCE] } };
  // Deals imported earlier this same flyer week are replaced, not kept as
  // history - re-importing the same flyer would otherwise look like weeks
  // of prices.
  await prisma.$transaction([
    prisma.flyerDeal.deleteMany({ where: { ...retire, createdAt: { gte: latestFlyerStart() } } }),
    prisma.flyerDeal.updateMany({ where: retire, data: { isCurrent: false } }),
    ...(deals.length ? [prisma.flyerDeal.createMany({ data: deals.map((d) => ({ ...d, userId, source: FLIPP_SOURCE })) })] : []),
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
  const saved = await saveCurrentDeals(userId, result.deals);
  const repaired = await repairPastFlippRows(userId, result.deals.map((d) => ({ ...d, source: FLIPP_SOURCE })));
  return { count: result.deals.length, photos: countPhotos(result.deals), stores: saved, failed: result.failed, repaired };
}

// Flipp rows matched by the name the import gives them now (the English
// half of "pommes Cortland | apples", French-only names in English), so
// past weeks line up with this week's same products - and this week's
// rows pick up a naming fix without waiting for the next import. Returns
// how many were renamed.
async function renamePastFlippRows(userId) {
  const rows = await prisma.flyerDeal.findMany({
    where: { ...(userId ? { userId } : {}), source: FLIPP_SOURCE, createdAt: { gte: new Date(Date.now() - HISTORY_WINDOW_MS) } },
    select: { id: true, item: true, matchName: true },
  });
  const renames = rows
    .map((r) => ({ id: r.id, matchName: toMatchName(r.item) || r.item.toLowerCase() }))
    .filter((r, i) => r.matchName !== rows[i].matchName);
  for (let i = 0; i < renames.length; i += 200) {
    await prisma.$transaction(renames.slice(i, i + 200).map((r) => prisma.flyerDeal.update({ where: { id: r.id }, data: { matchName: r.matchName } })));
  }
  return renames.length;
}

// Every user's Flipp rows, renamed once at start-up so a deploy that
// changes how names are read applies to what's already stored.
export function renameAllFlippRows() {
  return renamePastFlippRows(null);
}

// Past weeks' Flipp rows saved before the import read each item's own page
// got per-lb prices as "each" and amounts off as prices. Once this week's
// import reads the same product at the same store correctly, those past
// rows are corrected to match, so the 6-month history lines up.
export async function repairPastFlippRows(userId, current) {
  await renamePastFlippRows(userId);
  const history = await prisma.flyerDeal.findMany({
    where: {
      userId,
      isCurrent: false,
      source: FLIPP_SOURCE,
      unitBasis: "each",
      createdAt: { gte: new Date(Date.now() - HISTORY_WINDOW_MS) },
    },
    select: { id: true, store: true, source: true, item: true, matchName: true, price: true, unitPrice: true, unitBasis: true },
  });
  const perLb = findPerLbSavedEach(current, history);
  const amountsOff = findAmountOffSavedAsPrice(current, history);
  if (perLb.length + amountsOff.length === 0) return 0;
  await prisma.$transaction([
    ...perLb.map((r) =>
      prisma.flyerDeal.update({ where: { id: r.id }, data: { unitBasis: "lb", price: /\/lb$/.test(r.price) ? r.price : `${r.price}/lb` } })
    ),
    ...amountsOff.map((r) =>
      prisma.flyerDeal.update({ where: { id: r.id }, data: { unitPrice: null, unitBasis: null, regularPrice: null, price: `$${r.amount.toFixed(2)} off` } })
    ),
  ]);
  return perLb.length + amountsOff.length;
}

const countPhotos = (deals) => deals.filter((d) => d.imageUrl).length;

// "812 items, 790 with photos" - so a week without photos shows up.
function photoNote({ count, photos }) {
  return `${count} item${count === 1 ? "" : "s"}, ${photos === count ? "all" : photos} with photos.`;
}

async function record(userId, patch) {
  const now = new Date();
  return prisma.flyerSettings.update({
    where: { userId },
    data: { lastImportAt: now, ...(patch.lastImportOk ? { lastSuccessAt: now } : {}), ...patch },
  });
}

// One account's import, and the outcome saved on its settings for the
// Flyers screen.
export async function runImportForUser(userId, { fetchImpl = fetch } = {}) {
  const settings = await getOrCreateSettings(userId);
  try {
    const result = await importFlipp(userId, settings, { fetchImpl });
    const note = result.failed.length ? `Couldn't read: ${result.failed.join("; ")}` : null;
    return serializeSettings(
      await record(userId, {
        lastImportOk: true,
        lastImportCount: result.count,
        lastImportSource: FLIPP_SOURCE,
        lastImportMessage: `${result.stores.join(", ")}: ${photoNote(result)}${note ? ` ${note}` : ""}`,
      })
    );
  } catch (err) {
    return serializeSettings(
      await record(userId, {
        lastImportOk: false,
        lastImportCount: 0,
        lastImportSource: null,
        lastImportMessage: `Flipp: ${err.message.replace(/^Flipp: /, "")}.`.slice(0, 500),
      })
    );
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
export function startFlyerScheduler({ onRenamed } = {}) {
  if (String(process.env.FLYER_AUTO_IMPORT).toLowerCase() === "off") return;
  renameAllFlippRows()
    .then((n) => {
      if (n > 0) {
        console.log(`Renamed ${n} stored flyer items to the current matching names.`);
        onRenamed?.();
      }
    })
    .catch((err) => console.error("Renaming stored flyer items failed:", err));
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
