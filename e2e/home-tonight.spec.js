import { expect, test } from "@playwright/test";

// Tonight's card for something you wrote on the planner ("Hockey pool")
// has nothing to cook: no photo, no Start cooking.

test.use({ viewport: { width: 1280, height: 1000 } });

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

test("a written note tonight shows without Start cooking", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `home-tonight+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");

  const today = (new Date().getDay() + 6) % 7;
  await page.request.post("/api/planner/blank", {
    data: { weekStart: mondayOf(new Date()), dayOfWeek: today, mealType: "dinner", note: "Hockey Pool @ Normal" },
  });
  await page.reload();
  const hero = page.locator(".riso-home-hero");
  await expect(hero.locator(".riso-home-hero-title")).toHaveText("Hockey Pool @ Normal");
  await expect(hero.getByRole("button", { name: "Start cooking" })).toHaveCount(0);
  await expect(hero).not.toContainText("Eating out tonight");
  await expect(hero.locator("img")).toHaveCount(0);
  await hero.getByRole("button", { name: "Change in planner" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Planner");
});
