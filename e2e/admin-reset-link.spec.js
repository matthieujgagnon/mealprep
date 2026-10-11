import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Password reset in the beta, when no email can be sent: the Reset link button
// in Admin → Members, and a Forgot password page that says it can't send
// emails instead of pretending. playwright.config.js lists e2e-reset-admin in
// ADMIN_EMAILS and leaves Resend unset. Signup refuses a listed email, so the
// admin account is made straight in the database.
const prisma = new PrismaClient();
const ADMIN = "e2e-reset-admin@example.com";
const PASSWORD = "adminpass123";
const OLD_PASSWORD = "originalpass123";

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

async function memberAccount(prefix, locale) {
  const email = uniqueEmail(prefix);
  await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(OLD_PASSWORD, 10), locale } });
  return email;
}

async function logIn(page, email, password) {
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.locator('input[type="password"]').press("Enter");
  await expect(page.locator(".app-header")).toBeVisible();
}

// Where a reset link leads, as a path: the tests run on whatever address the
// server is on, not the one in APP_URL.
function pathOf(link) {
  const url = new URL(link);
  return url.pathname + url.search;
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("on a computer, in English", () => {
  test.use({ viewport: { width: 1280, height: 900 }, locale: "en-CA" });

  test("an admin makes a reset link for a member: it works once, and a new one replaces it", async ({ page, browser, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await adminAccount("en");
    const member = await memberAccount("reset-member", "en");

    await page.goto("/admin");
    await logIn(page, ADMIN, PASSWORD);
    const row = page.locator(".riso-admin-members .riso-admin-table tbody tr", { hasText: member });
    await row.getByRole("button", { name: `Make a reset link for ${member}` }).click();

    // The link shows under the member, with how long it lasts, and Copy says so on the button.
    const box = page.locator(".riso-admin-reset");
    await expect(box).toContainText("It works once and expires in 1 hour");
    const first = (await box.locator(".riso-admin-reset-url").textContent()).trim();
    expect(first).toMatch(/\/reset-password\?token=\w+$/);
    const copy = box.getByRole("button", { name: `Copy the reset link for ${member}` });
    await copy.click();
    await expect(copy).toHaveText("✓ Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(first);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);

    // Making another replaces it.
    await row.getByRole("button", { name: `Make a reset link for ${member}` }).click();
    await expect(box.locator(".riso-admin-reset-url")).not.toHaveText(first);
    const second = (await box.locator(".riso-admin-reset-url").textContent()).trim();

    // The member opens the first link: it no longer works.
    const memberContext = await browser.newContext({ locale: "en-CA" });
    const memberPage = await memberContext.newPage();
    await memberPage.goto(pathOf(first));
    await memberPage.locator('input[autocomplete="new-password"]').nth(0).fill("brandnewpass456");
    await memberPage.locator('input[autocomplete="new-password"]').nth(1).fill("brandnewpass456");
    await memberPage.getByRole("button", { name: "Set new password" }).click();
    await expect(memberPage.getByText(/invalid or has expired/i)).toBeVisible();

    // The second one sets the new password...
    await memberPage.goto(pathOf(second));
    await memberPage.locator('input[autocomplete="new-password"]').nth(0).fill("brandnewpass456");
    await memberPage.locator('input[autocomplete="new-password"]').nth(1).fill("brandnewpass456");
    await memberPage.getByRole("button", { name: "Set new password" }).click();
    await expect(memberPage.getByText("Password updated")).toBeVisible();

    // ...once.
    await memberPage.goto(pathOf(second));
    await memberPage.locator('input[autocomplete="new-password"]').nth(0).fill("sneakypass789");
    await memberPage.locator('input[autocomplete="new-password"]').nth(1).fill("sneakypass789");
    await memberPage.getByRole("button", { name: "Set new password" }).click();
    await expect(memberPage.getByText(/invalid or has expired/i)).toBeVisible();

    // The member logs in with the new password, not the old one.
    await memberPage.goto("/");
    await memberPage.fill('input[type="email"]', member);
    await memberPage.fill('input[type="password"]', OLD_PASSWORD);
    await memberPage.locator('input[type="password"]').press("Enter");
    await expect(memberPage.getByText("Incorrect email or password")).toBeVisible();
    await logIn(memberPage, member, "brandnewpass456");
    await memberContext.close();
  });

  test("the Forgot password page says it can't send emails, whatever email is typed", async ({ page }) => {
    const member = await memberAccount("forgot-member", "en");
    const calm = "We can't send emails yet. Ask Matt for a reset link.";

    for (const typed of [member, uniqueEmail("nobody")]) {
      await page.goto("/");
      await page.getByRole("button", { name: "Forgot password?" }).click();
      await page.fill('input[type="email"]', typed);
      await page.getByRole("button", { name: "Send reset link" }).click();
      await expect(page.getByText(calm)).toBeVisible();
      // Never "sent", and the same page for an email with an account and one without.
      await expect(page.getByText(/we've sent|check your inbox/i)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "← Back to log in" })).toBeVisible();
    }

    // Nothing was made for the member.
    const user = await prisma.user.findUniqueOrThrow({ where: { email: member } });
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
  });
});

test.describe("on a phone, in French", () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: "fr-CA" });

  test("the Forgot password page says it can't send emails, and fits", async ({ page }) => {
    const member = await memberAccount("forgot-fr", "fr");
    const calm = "Nous ne pouvons pas encore envoyer de courriels. Demandez un lien de réinitialisation à Matt.";

    for (const typed of [member, uniqueEmail("personne")]) {
      await page.goto("/");
      await page.getByRole("button", { name: "Mot de passe oublié?" }).click();
      await page.fill('input[type="email"]', typed);
      await page.getByRole("button", { name: "Envoyer le lien" }).click();
      await expect(page.getByText(calm)).toBeVisible();
      await expect(page.getByText(/envoyé un lien|boîte de réception/i)).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    }
  });

  test("the admin makes a reset link on a phone and the page fits", async ({ page }) => {
    await adminAccount("fr");
    const member = await memberAccount("reset-fr", "fr");

    await page.goto("/admin");
    await logIn(page, ADMIN, PASSWORD);
    const block = page.locator(".riso-admin-members .riso-admin-table tbody tr", { hasText: member });
    await block.getByRole("button", { name: `Créer un lien de réinitialisation pour ${member}` }).click();

    const box = page.locator(".riso-admin-reset");
    await expect(box).toContainText("Il ne fonctionne qu'une fois et expire dans 1 heure");
    await expect(box.locator(".riso-admin-reset-url")).toContainText("/reset-password?token=");
    await expect(box.getByRole("button", { name: `Copier le lien de réinitialisation de ${member}` })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
