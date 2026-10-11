import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { accountButton } from "./account-menu.js";

// The Admin page. playwright.config.js lists e2e-admin@example.com and
// e2e-unclaimed@example.com in ADMIN_EMAILS. Signup refuses a listed email,
// so the admin account is made straight in the database (like an account that
// existed before its email was listed); e2e-unclaimed never gets an account.
const prisma = new PrismaClient();
const ADMIN = "e2e-admin@example.com";
const UNCLAIMED = "e2e-unclaimed@example.com";
const PASSWORD = "adminpass123";
const HQ = "https://claude.ai/artifact/S6zZyugUt88RSg4SXM8V2Y";

test.describe.configure({ mode: "serial" });

function uniqueEmail(prefix) {
  return `${prefix}+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function adminAccount(locale) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: ADMIN },
    update: { passwordHash, locale },
    create: { email: ADMIN, passwordHash, locale },
  });
}

async function logIn(page, email, password) {
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.locator('input[type="password"]').press("Enter");
  await expect(page.locator(".app-header")).toBeVisible();
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("on a computer, in English", () => {
  test.use({ viewport: { width: 1280, height: 900 }, locale: "en-CA" });

  test("an admin finds Admin in the avatar menu: HQ, Members and what's coming", async ({ page, context }) => {
    await adminAccount("en");
    const member = uniqueEmail("admin-members");
    await prisma.user.create({ data: { email: member, passwordHash: "x" } });

    // Opening the address while logged out logs in first, then shows the page.
    await page.goto("/admin");
    await logIn(page, ADMIN, PASSWORD);
    await expect(page.getByRole("heading", { name: "Behind the counter." })).toBeVisible();
    await page.goto("/");

    await (await accountButton(page, "Admin")).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Behind the counter." })).toBeVisible();

    // Project HQ opens in a new tab.
    const hq = page.getByRole("link", { name: /Open HQ/ });
    await expect(hq).toHaveAttribute("href", HQ);
    await expect(hq).toHaveAttribute("target", "_blank");
    await context.route("https://claude.ai/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>HQ</title>" }));
    const [popup] = await Promise.all([page.waitForEvent("popup"), hq.click()]);
    await expect(popup).toHaveURL(HQ);
    await popup.close();

    // Members: email, signup date and last active, nothing else.
    const table = page.locator(".riso-admin-table");
    await expect(table.locator("thead th")).toHaveText(["Email", "Signed up", "Last active"]);
    const me = table.locator("tbody tr", { hasText: ADMIN });
    await expect(me.getByText("You", { exact: true })).toBeVisible();
    await expect(me.locator("td").last()).toHaveText("Today");
    await expect(table.locator("tbody tr", { hasText: member }).locator("td")).toHaveText([/\d{4}|Today/, "Not yet"]);

    for (const title of ["Invite codes", "AI usage"]) {
      const card = page.locator(".riso-admin-card", { has: page.getByRole("heading", { name: title }) });
      await expect(card.getByText("Coming soon")).toBeVisible();
    }

    // Back goes back to where the menu was opened, at /.
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".riso-admin")).toHaveCount(0);
  });

  test("a member sees no Admin link, gets Not allowed at /admin, and the server refuses them", async ({ page, playwright }) => {
    await signUp(page, uniqueEmail("admin-member"));
    await expect(page.locator(".tab.active")).toBeVisible();
    await expect(await accountButton(page, "Help")).toBeVisible();
    await expect(page.getByRole("button", { name: "Admin", exact: true })).toHaveCount(0);

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Not allowed." })).toBeVisible();
    await expect(page.locator(".riso-admin-table")).toHaveCount(0);

    // The server checks for itself: 403 for a member on any /admin route...
    expect((await page.request.get("/api/admin/members")).status()).toBe(403);
    expect((await page.request.get("/api/admin/anything")).status()).toBe(403);
    // ...and 401 for someone not logged in.
    const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:4000" });
    expect((await anonymous.get("/api/admin/members")).status()).toBe(401);
    await anonymous.dispose();

    await page.getByRole("button", { name: "Back to Home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".tab.active")).toHaveText("Home");
  });

  test("nobody can sign up with a listed email that has no account", async ({ page }) => {
    await signUp(page, UNCLAIMED);
    await expect(page.getByText("An account with that email already exists.")).toBeVisible();
    expect(await prisma.user.findUnique({ where: { email: UNCLAIMED } })).toBeNull();
  });
});

test.describe("on a phone, in French", () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: "fr-CA" });

  test("the admin opens Admin from the avatar menu and the page fits", async ({ page }) => {
    await adminAccount("fr");
    await page.goto("/");
    await logIn(page, ADMIN, PASSWORD);

    await (await accountButton(page, "Admin")).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Derrière le comptoir." })).toBeVisible();
    await expect(page.getByRole("link", { name: /Ouvrir le QG/ })).toHaveAttribute("target", "_blank");
    await expect(page.getByRole("heading", { name: "Membres" })).toBeVisible();
    await expect(page.locator(".riso-admin-table tbody tr", { hasText: ADMIN }).getByText("Vous", { exact: true })).toBeVisible();
    await expect(page.getByText("Bientôt")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
