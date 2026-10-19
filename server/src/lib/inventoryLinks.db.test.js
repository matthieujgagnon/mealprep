import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { LINK_MAX } from "./inventoryLinks.js";
import { inventoryLinksRouter } from "../routes/inventoryLinks.js";

// /api/inventory-links against the real database: only your own links are seen
// and removed, saving the same pair twice is one link, bad names and too many are
// refused, and the links go with their account. Skipped when no database is
// reachable (or the table is not there yet).
let dbUp = true;
try {
  await prisma.$queryRaw`SELECT 1`;
  await prisma.inventoryLink.count();
} catch {
  dbUp = false;
}

describe.skipIf(!dbUp)("/api/inventory-links (database)", () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  let server;
  let base;
  let me;
  let other;
  let signedIn; // whose request it is, set per call

  async function call(path, { as = me, method = "GET", body, lang } = {}) {
    signedIn = as;
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(lang ? { "X-Lang": lang } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  }
  const post = (body, options) => call("/api/inventory-links", { method: "POST", body, ...options });
  const list = (options) => call("/api/inventory-links", options);

  beforeAll(async () => {
    me = (await prisma.user.create({ data: { email: `links-me-${stamp}@example.com`, passwordHash: "x" } })).id;
    other = (await prisma.user.create({ data: { email: `links-other-${stamp}@example.com`, passwordHash: "x" } })).id;
    const app = express();
    app.use(express.json());
    app.use(
      "/api/inventory-links",
      (req, _res, next) => {
        req.userId = signedIn;
        next();
      },
      inventoryLinksRouter
    );
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [me, other] } } });
    await new Promise((resolve) => server?.close(resolve));
  });

  it("saves a link, once, and lists it with both names as they were seen", async () => {
    const first = await post({ recipeName: "Rice vinegar", itemName: "Rice  wine vinegar" });
    expect(first.status).toBe(201);
    expect(first.data).toMatchObject({ recipeName: "rice vinegar", itemName: "rice wine vinegar", recipeLabel: "Rice vinegar", itemLabel: "Rice wine vinegar" });

    // The same pair again, in other capitals: the same link, not a second one.
    const again = await post({ recipeName: "RICE VINEGAR", itemName: "rice wine vinegar" });
    expect(again.status).toBe(200);
    expect(again.data.id).toBe(first.data.id);

    const links = (await list()).data;
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ id: first.data.id, recipeLabel: "Rice vinegar", itemLabel: "Rice wine vinegar" });
  });

  it("keeps a different pair, and the other direction, as links of their own", async () => {
    await post({ recipeName: "Red onion", itemName: "Yellow onion" });
    await post({ recipeName: "Yellow onion", itemName: "Red onion" });
    expect((await list()).data.map((l) => `${l.recipeName}<-${l.itemName}`).sort()).toEqual([
      "red onion<-yellow onion",
      "rice vinegar<-rice wine vinegar",
      "yellow onion<-red onion",
    ]);
  });

  it("refuses empty names, identical names and long names, in the language asked for", async () => {
    expect((await post({ recipeName: "", itemName: "Rice" })).status).toBe(400);
    expect((await post({ recipeName: "Rice" })).status).toBe(400);
    const same = await post({ recipeName: "Crème sure", itemName: "creme sure" }, { lang: "en" });
    expect(same).toMatchObject({ status: 400, data: { code: "linkSame", error: "Those two names are already the same." } });
    expect((await post({ recipeName: "Crème sure", itemName: "creme sure" }, { lang: "fr" })).data.error).toBe("Ces deux noms sont déjà les mêmes.");
    expect((await post({ recipeName: "a".repeat(500), itemName: "Rice" })).status).toBe(400);
  });

  it("shows you only your own links, and removes only your own", async () => {
    const theirs = (await post({ recipeName: "Lime", itemName: "Limes bag" }, { as: other })).data;
    expect((await list({ as: other })).data.map((l) => l.id)).toEqual([theirs.id]);
    expect((await list()).data.some((l) => l.id === theirs.id)).toBe(false);

    // Not yours: 404, and it is still there.
    expect((await call(`/api/inventory-links/${theirs.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await list({ as: other })).data).toHaveLength(1);

    // Yours: 204, gone, and a second time is a 404.
    const mine = (await list()).data[0];
    expect((await call(`/api/inventory-links/${mine.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await list()).data.some((l) => l.id === mine.id)).toBe(false);
    expect((await call(`/api/inventory-links/${mine.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await call("/api/inventory-links/nope", { method: "DELETE" })).status).toBe(404);
  });

  it("puts a removed link back with the same save (Undo), and stops at the cap", async () => {
    const back = await post({ recipeName: "Rice vinegar", itemName: "Rice wine vinegar" });
    expect(back.status).toBe(201);

    const have = await prisma.inventoryLink.count({ where: { userId: me } });
    await prisma.inventoryLink.createMany({
      data: Array.from({ length: LINK_MAX - have }, (_, i) => ({ userId: me, recipeName: `bulk ${i}`, itemName: `item ${i}`, recipeLabel: `Bulk ${i}`, itemLabel: `Item ${i}` })),
    });
    const over = await post({ recipeName: "One too many", itemName: "Another" }, { lang: "en" });
    expect(over).toMatchObject({ status: 400, data: { code: "linkLimit" } });
    // A link that is already there still answers at the cap.
    expect((await post({ recipeName: "Rice vinegar", itemName: "Rice wine vinegar" })).status).toBe(200);
  });

  it("goes with the account", async () => {
    await prisma.user.delete({ where: { id: other } });
    expect(await prisma.inventoryLink.count({ where: { userId: other } })).toBe(0);
    other = (await prisma.user.create({ data: { email: `links-other2-${stamp}@example.com`, passwordHash: "x" } })).id;
  });
});
