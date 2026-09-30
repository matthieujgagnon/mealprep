import { expect, test } from "@playwright/test";

// The Flyers auto-import strip and its settings. The test server's Flipp
// and Le Rabais addresses refuse connections (see playwright.config.js),
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
  await strip.getByLabel("Another store").fill("Adonis");
  await strip.getByLabel("Another store").press("Enter");
  await strip.getByRole("switch", { name: "Import every week" }).click();
  await strip.getByRole("button", { name: "Save" }).click();

  await expect(strip.locator(".riso-auto-import-badge")).toHaveText("auto-import off");
  await expect(strip).toContainText("Metro, IGA, Super C, Provigo, Adonis near H3B 1A7");
  const saved = await (await page.request.get("/api/flyers/settings")).json();
  expect(saved).toMatchObject({ postalCode: "H3B1A7", autoImport: false, stores: ["Metro", "IGA", "Super C", "Provigo", "Adonis"] });
});

test("Import now reports when neither Flipp nor Le Rabais can be reached", async ({ page }) => {
  await signUpToFlyers(page);
  const strip = page.locator(".riso-auto-import");
  await strip.getByRole("button", { name: "Import now" }).click();
  await expect(strip).toHaveClass(/failed/);
  await expect(strip.locator(".riso-auto-import-last")).toContainText("didn't work");
  await expect(strip.locator(".riso-auto-import-last")).toContainText("Le Rabais");
  // The sample deals stay until a real import works.
  await expect(page.locator(".riso-flyers-sample-note")).toBeVisible();
});

test("the weekly cron endpoint refuses without the shared secret", async ({ request }) => {
  const res = await request.post("/api/cron/flyer-import");
  expect([401, 503]).toContain(res.status());
});
