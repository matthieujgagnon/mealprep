import { expect, test } from "@playwright/test";

// The Flyers auto-import strip and its settings. The test server's Flipp
// address refuses connections (see playwright.config.js),
// so Import now always takes the failure path here; the success path is
// covered against fixtures in server/src/lib/flyerImport.db.test.js.

async function signUpToFlyers(page) {
  const email = `flyers-import+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole("button", { name: "Flyers", exact: true }).click();
}

test("auto-import starts on with the default stores, and its settings save", async ({ page }) => {
  await signUpToFlyers(page);
  const strip = page.locator(".riso-auto-import");
  await expect(strip.locator(".riso-auto-import-badge")).toHaveText("auto-import on");
  await expect(strip).toContainText("Metro, IGA, Maxi, Super C, Provigo near H2T 2S3");
  await expect(strip).toContainText("Nothing imported yet.");

  await strip.getByRole("button", { name: "Settings" }).click();
  await expect(strip.locator(".riso-import-note")).toContainText("Couldn't reach Flipp");

  await strip.getByPlaceholder("H2T 2S3").fill("12345");
  await strip.getByRole("button", { name: "Save" }).click();
  await expect(strip.locator(".riso-error")).toContainText("Canadian postal code");

  await strip.getByPlaceholder("H2T 2S3").fill("h3b 1a7");
  await strip.getByRole("button", { name: "✓ Maxi" }).click();
  await strip.getByRole("switch", { name: "Import every week" }).click();
  await strip.getByRole("button", { name: "Save" }).click();

  await expect(strip.locator(".riso-auto-import-badge")).toHaveText("auto-import off");
  await expect(strip).toContainText("Metro, IGA, Super C, Provigo near H3B 1A7");
  const saved = await (await page.request.get("/api/flyers/settings")).json();
  expect(saved).toMatchObject({ postalCode: "H3B1A7", autoImport: false, stores: ["Metro", "IGA", "Super C", "Provigo"] });
});

test("the store picker offers only the stores Flipp lists near the postal code", async ({ page }) => {
  await page.route("**/api/flyers/stores?**", (route) =>
    route.fulfill({ json: { stores: ["Adonis", "IGA extra", "Metro", "Super C"] } })
  );
  await signUpToFlyers(page);
  const strip = page.locator(".riso-auto-import");
  await strip.getByRole("button", { name: "Settings" }).click();
  const chips = strip.locator(".riso-import-stores .riso-chip");
  await expect(chips).toHaveText(["Adonis", "✓ IGA extra", "✓ Metro", "✓ Super C"]);
  await expect(strip.getByLabel("Another store")).toHaveCount(0);
  // Maxi and Provigo have no flyer on Flipp here, so they're dropped.
  await expect(strip.locator(".riso-import-dropped")).toContainText("Removed Maxi, Provigo");
  await strip.getByRole("button", { name: "Adonis" }).click();
  // Read the settings back only once the save has landed.
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/flyers/settings") && r.request().method() === "PUT"),
    strip.getByRole("button", { name: "Save" }).click(),
  ]);
  const saved = await (await page.request.get("/api/flyers/settings")).json();
  expect(saved.stores).toEqual(["Metro", "IGA extra", "Super C", "Adonis"]);
});

test("each store's flyer can be opened from the Flyers page and an item's details", async ({ page }) => {
  await signUpToFlyers(page);
  const links = page.locator(".riso-flyer-links a");
  await expect(links.first()).toBeVisible();
  const metro = page.locator(".riso-flyer-links").getByRole("link", { name: "Metro ↗" });
  if (await metro.count()) await expect(metro).toHaveAttribute("href", "https://www.metro.ca/en/flyer");
  for (const a of await links.all()) {
    await expect(a).toHaveAttribute("target", "_blank");
    expect(await a.getAttribute("href")).toMatch(/^https:\/\//);
  }
  await page.locator(".riso-ing-main").first().click();
  await page.locator(".riso-ing-variant-names").first().click();
  await expect(page.getByRole("dialog").getByRole("link", { name: /^Open the .+ flyer ↗$/ })).toBeVisible();
});

test("Import now reports when Flipp can't be reached", async ({ page }) => {
  await signUpToFlyers(page);
  const strip = page.locator(".riso-auto-import");
  await strip.getByRole("button", { name: "Import now" }).click();
  await expect(strip).toHaveClass(/failed/);
  await expect(strip.locator(".riso-auto-import-last")).toContainText("didn't work");
  await expect(strip.locator(".riso-auto-import-last")).toContainText("Flipp");
  // The sample deals stay until a real import works.
  await expect(page.locator(".riso-flyers-sample-note")).toBeVisible();
});

test("the weekly cron endpoint refuses without the shared secret", async ({ request }) => {
  const res = await request.post("/api/cron/flyer-import");
  expect([401, 503]).toContain(res.status());
});
