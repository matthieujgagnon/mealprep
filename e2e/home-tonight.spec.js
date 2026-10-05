import { expect, test } from "@playwright/test";

// Tonight's card for something you wrote on the planner ("Hockey pool")
// has nothing to cook: no photo, no Start cooking - a yellow emoji tile,
// "Not from a recipe" / "Nothing to prep", and "Pick a recipe instead".

test.use({ viewport: { width: 1280, height: 1000 } });

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

// These are about supper, which is the card from 3 pm: fix the clock at 6 pm
// so they give the same answer whenever they run.
test.beforeEach(async ({ page }) => {
  const evening = new Date();
  evening.setHours(18, 0, 0, 0);
  await page.clock.setFixedTime(evening);
});

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
  await expect(hero.locator(".riso-home-hero-pill")).toHaveText(["Not from a recipe", "Nothing to prep"]);
  await expect(hero.getByText("nothing to buy!")).toHaveCount(0);
  await hero.getByRole("button", { name: "Change in planner" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Planner");
});

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `home-tonight+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
}

test("a written meal gets its food's emoji, and Pick a recipe instead swaps tonight for a recipe", async ({ page }) => {
  await signUp(page);
  const recipe = await (
    await page.request.post("/api/recipes", { data: { title: "Lemon chicken orzo", ingredients: [{ name: "orzo" }] } })
  ).json();
  const today = (new Date().getDay() + 6) % 7;
  await page.request.post("/api/planner/blank", {
    data: { weekStart: mondayOf(new Date()), dayOfWeek: today, mealType: "dinner", note: "Fries night" },
  });
  await page.reload();
  const hero = page.locator(".riso-home-hero");
  await expect(hero.locator(".riso-home-hero-emoji")).toHaveText("🍟");
  await expect(hero.locator(".riso-home-hero-title")).toHaveText("Fries night");
  await expect(hero.locator(".riso-home-hero-blurb")).toContainText("free-text meal");

  await hero.getByRole("button", { name: "Pick a recipe instead" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Planner");
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  await expect(page.locator(".fnd-target")).toContainText(DAYS[today]);
  await page.getByRole("button", { name: `Add ${recipe.title} to the plan` }).click();
  await expect(page.locator(".riso-toast")).toContainText("replaced");

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(hero.locator(".riso-home-hero-title")).toHaveText("Lemon chicken orzo");
  await expect(hero.getByRole("button", { name: "Start cooking" })).toBeVisible();
});

test("past suppers this week are greyed out; today is pink", async ({ page }) => {
  await signUp(page);
  const today = (new Date().getDay() + 6) % 7;
  await expect(page.locator(".riso-home-week-day.past")).toHaveCount(today);
  await expect(page.locator(".riso-home-week-day.today")).toHaveCount(1);
  if (today > 0) {
    await expect(page.locator(".riso-home-week-day.past").first()).toHaveCSS("background-color", "rgb(233, 228, 216)");
  }
});
