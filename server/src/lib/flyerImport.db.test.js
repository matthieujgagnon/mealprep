import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { runImportForUser } from "./flyerImport.js";

// Runs a whole import against the real database with Flipp and Le Rabais
// answered by fixtures - checks what gets written, the fallback, and the
// history backfill. Skipped when no database is reachable.
let dbUp = true;
try {
  await prisma.$queryRaw`SELECT 1`;
} catch {
  dbUp = false;
}

const LE_RABAIS = `|CodePostal|Emoji|Type|Date Debut|Date Fin|Catégorie|Produit|Product|Pays|Magasin|Prix unité, lb et kg|Lien|NomImage|Conservation|
:--|:--|:--|--:|--:|:--|:--|:--|:--|:--|:--|:--|:--|:--|
|H2T2S3|🥩|Viande|2026-08-06|2026-08-12|Poulet|Poitrine de poulet|Chicken breast||Metro|5,99 $ /lb (13,21 $/kg)|x|a.jpg||
|H2T2S3|🥩|Viande|2026-08-13|2026-08-19|Poulet|Poitrine de poulet|Chicken breast||Metro|6,49 $ /lb (14,31 $/kg)|x|b.jpg||
|H2T2S3|🍋|Fruits|2026-01-01|2099-12-31|Citrons|Citrons|Lemons||Adonis|10 pour 4,99 $|x|c.jpg||`;

function fetchWith({ flipp = true } = {}) {
  return async (url) => {
    const u = String(url);
    if (u.includes("lerabais.com")) return { ok: true, text: async () => LE_RABAIS };
    if (!flipp) return { ok: false, status: 503 };
    const body = u.includes("/flipp/flyers?")
      ? { flyers: [{ id: 7, merchant: "Metro", valid_to: "2099-12-31T23:59:59-04:00", categories: ["Groceries"] }] }
      : { items: [{ name: "Boneless Chicken Breasts", price: "4.49", post_price_text: "/lb" }, { name: "Banner", price: "" }] };
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

  it("imports Flipp as this week's deals and adds Le Rabais' past weeks as history", async () => {
    const settings = await runImportForUser(user.id, { fetchImpl: fetchWith() });
    expect(settings).toMatchObject({ lastImportOk: true, lastImportCount: 1, lastImportSource: "Flipp", lastImportMessage: "Metro" });

    const current = await prisma.flyerDeal.findMany({ where: { userId: user.id, isCurrent: true } });
    expect(current.map((d) => [d.source, d.store, d.price, d.unitPrice])).toEqual([["Flipp", "Metro", "$4.49/lb", 4.49]]);

    const history = await prisma.flyerDeal.findMany({ where: { userId: user.id, isCurrent: false }, orderBy: { createdAt: "asc" } });
    expect(history.map((d) => [d.source, d.unitPrice, d.createdAt.toISOString().slice(0, 10)])).toEqual([
      ["Le Rabais", 5.99, "2026-08-06"],
      ["Le Rabais", 6.49, "2026-08-13"],
    ]);
  });

  it("keeps last week's Flipp prices as history and never backfills a week twice", async () => {
    await runImportForUser(user.id, { fetchImpl: fetchWith() });
    const rows = await prisma.flyerDeal.findMany({ where: { userId: user.id } });
    expect(rows.filter((d) => d.isCurrent)).toHaveLength(1);
    expect(rows.filter((d) => d.source === "Flipp" && !d.isCurrent)).toHaveLength(1);
    expect(rows.filter((d) => d.source === "Le Rabais")).toHaveLength(2);
  });

  it("falls back to Le Rabais when Flipp can't be read", async () => {
    const settings = await runImportForUser(user.id, { fetchImpl: fetchWith({ flipp: false }) });
    expect(settings.lastImportOk).toBe(true);
    expect(settings.lastImportSource).toBe("Le Rabais");
    expect(settings.lastImportMessage).toMatch(/^Flipp couldn't be read \(Flipp answered 503/);
    // Adonis comes from Le Rabais; Metro's current Flipp flyer isn't doubled.
    const current = await prisma.flyerDeal.findMany({ where: { userId: user.id, isCurrent: true } });
    expect(current.map((d) => `${d.source}:${d.store}`).sort()).toEqual(["Flipp:Metro", "Le Rabais:Adonis"]);
  });
});
