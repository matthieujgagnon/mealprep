import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { runImportForUser } from "./flyerImport.js";

// Runs a whole import against the real database with Flipp answered by
// fixtures - checks what gets written, history and failures. Skipped when no
// database is reachable.
let dbUp = true;
try {
  await prisma.$queryRaw`SELECT 1`;
} catch {
  dbUp = false;
}

function fetchWith({ flipp = true, items = null, pages = {} } = {}) {
  return async (url) => {
    const u = String(url);
    if (!flipp) return { ok: false, status: 503 };
    const page = u.match(/\/items\/([^?]+)/);
    const body = u.includes("/flipp/flyers?")
      ? { flyers: [{ id: 7, merchant: "Metro", valid_to: "2099-12-31T23:59:59-04:00", categories: ["Groceries"] }] }
      : page
        ? { item: pages[page[1]] || {} }
        : { items: items || [{ name: "Boneless Chicken Breasts", price: "4.49", post_price_text: "/lb" }, { name: "Banner", price: "" }] };
    return { ok: true, json: async () => body };
  };
}

describe.skipIf(!dbUp)("runImportForUser", () => {
  let user;
  beforeAll(async () => {
    user = await prisma.user.create({ data: { email: `flyer-import-${Date.now()}@example.com`, passwordHash: "x" } });
  });
  afterAll(async () => {
    if (user) await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  it("imports Flipp as this week's deals", async () => {
    // A deal an older version took from Le Rabais is retired, not shown.
    await prisma.flyerDeal.create({
      data: { userId: user.id, source: "Le Rabais", store: "Adonis", item: "Lemons", matchName: "lemons", price: "$0.50", unitPrice: 0.5, unitBasis: "each", category: "produce" },
    });
    const settings = await runImportForUser(user.id, { fetchImpl: fetchWith() });
    expect(settings).toMatchObject({ lastImportOk: true, lastImportCount: 1, lastImportSource: "Flipp", lastImportMessage: "Metro: 1 item, 0 with photos." });

    const current = await prisma.flyerDeal.findMany({ where: { userId: user.id, isCurrent: true } });
    expect(current.map((d) => [d.source, d.store, d.price, d.unitPrice])).toEqual([["Flipp", "Metro", "$4.49/lb", 4.49]]);
    await prisma.flyerDeal.deleteMany({ where: { userId: user.id, source: "Le Rabais" } });
  });

  it("replaces a same-week re-import and keeps last week's Flipp prices as history", async () => {
    await runImportForUser(user.id, { fetchImpl: fetchWith() });
    let rows = await prisma.flyerDeal.findMany({ where: { userId: user.id } });
    expect(rows.filter((d) => d.isCurrent)).toHaveLength(1);
    expect(rows.filter((d) => d.source === "Flipp" && !d.isCurrent)).toHaveLength(0);

    // Make this week's import last week's, then import again.
    await prisma.flyerDeal.updateMany({
      where: { userId: user.id, source: "Flipp" },
      data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });
    await runImportForUser(user.id, { fetchImpl: fetchWith() });
    rows = await prisma.flyerDeal.findMany({ where: { userId: user.id } });
    expect(rows.filter((d) => d.isCurrent)).toHaveLength(1);
    expect(rows.filter((d) => d.source === "Flipp" && !d.isCurrent)).toHaveLength(1);
  });

  it("corrects past weeks' Flipp rows saved before items were read from their own pages", async () => {
    const user = await prisma.user.create({ data: { email: `flyer-repair-${Date.now()}@example.com`, passwordHash: "x" } });
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const past = { userId: user.id, source: "Flipp", store: "Metro", category: "other", isCurrent: false, createdAt: twoWeeksAgo };
    await prisma.flyerDeal.createMany({
      data: [
        { ...past, item: "Pommes Cortland", matchName: "pommes cortland", price: "$1.29", unitPrice: 1.29, unitBasis: "each" },
        { ...past, item: "Vin rouge Les Trois Pignons", matchName: "vin rouge les trois pignons", price: "$3.00", unitPrice: 3, unitBasis: "each" },
      ],
    });
    await runImportForUser(user.id, {
      fetchImpl: fetchWith({
        items: [
          { id: 1, name: "Pommes Cortland", price: "0.99", discount: 40 },
          { id: 2, name: "Vin rouge Les Trois Pignons", price: "3.0" },
        ],
        pages: { 1: { price_text: "/lb", original_price: "1.69" }, 2: { pre_price_text: "rebais de", description: "750 ml" } },
      }),
    });
    const rows = await prisma.flyerDeal.findMany({ where: { userId: user.id, source: "Flipp" }, orderBy: { createdAt: "asc" } });
    const at = (re, current) => rows.find((r) => re.test(r.item) && r.isCurrent === current);
    expect(at(/Pommes/, true)).toMatchObject({ price: "$0.99/lb", unitPrice: 0.99, unitBasis: "lb", regularPrice: 1.69 });
    expect(at(/Vin/, true)).toMatchObject({ price: "$3.00 off", unitPrice: null, unitBasis: null });
    // Two weeks ago: the apples were per lb, the wine $3 off.
    expect(at(/Pommes/, false)).toMatchObject({ price: "$1.29/lb", unitPrice: 1.29, unitBasis: "lb" });
    expect(at(/Vin/, false)).toMatchObject({ price: "$3.00 off", unitPrice: null, unitBasis: null });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("reports when Flipp can't be read, and keeps this week's deals", async () => {
    const settings = await runImportForUser(user.id, { fetchImpl: fetchWith({ flipp: false }) });
    expect(settings).toMatchObject({ lastImportOk: false, lastImportCount: 0, lastImportSource: null });
    expect(settings.lastImportMessage).toMatch(/^Flipp: Flipp answered 503/);
    const current = await prisma.flyerDeal.findMany({ where: { userId: user.id, isCurrent: true } });
    expect(current.map((d) => `${d.source}:${d.store}`)).toEqual(["Flipp:Metro"]);
  });
});
