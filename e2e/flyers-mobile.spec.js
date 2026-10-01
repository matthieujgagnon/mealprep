import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// The Flyers screen on a phone: an opened ingredient card's "all stores"
// rows used to squeeze the product name to a few letters (and overlap the
// price and + List on iOS). Deals are seeded via Prisma, as in
// flyers-riso.spec.js.

const prisma = new PrismaClient();

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("an opened card's store rows fit a phone screen without overlapping", async ({ page }) => {
  const email = `flyers-mobile+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  const signedUp = page.waitForResponse((r) => r.url().includes("/api/auth/signup") && r.ok());
  await page.getByRole("button", { name: "Create account" }).click();
  await signedUp;
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const base = { userId: user.id, source: "Flipp", category: "produce", isCurrent: true };
  await prisma.flyerDeal.createMany({
    data: [
      { ...base, store: "Maxi", item: "Pommes Cortland | Cortland apples", matchName: "apples", price: "$0.99/lb", unitPrice: 0.99, unitBasis: "lb" },
      { ...base, store: "Super C", item: "Pommes Honeycrisp du Québec, 3 lb bag | Honeycrisp apples", matchName: "apples", price: "$5.99", unitPrice: 5.99, unitBasis: "each" },
      { ...base, store: "Metro", item: "Pommes McIntosh, 5 lb bag | McIntosh apples", matchName: "apples", price: "$4.99", unitPrice: 4.99, unitBasis: "each" },
    ],
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Flyers", exact: true }).click();
  await page.getByRole("button", { name: "Apples: every store's price" }).click();
  const rows = page.locator(".riso-ing-card.open .riso-ing-variant");
  await expect(rows).toHaveCount(3);
  await expect(rows.locator(".riso-ing-variant-store")).toHaveText(["MAXI", "METRO", "SUPER C"]);

  for (const row of await rows.all()) {
    const name = await row.locator(".riso-ing-variant-names").boundingBox();
    const price = await row.locator(".riso-ing-variant-price").boundingBox();
    const list = await row.locator(".riso-ing-list").boundingBox();
    expect(name.width).toBeGreaterThan(150);
    expect(overlaps(name, price)).toBe(false);
    expect(overlaps(name, list)).toBe(false);
    expect(overlaps(price, list)).toBe(false);
    expect(list.x + list.width).toBeLessThanOrEqual(390);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
