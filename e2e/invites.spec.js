import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { aiDay } from "../server/src/lib/aiLimit.js";
import { E2E_INVITE } from "./invite.js";
import { accountButton } from "./account-menu.js";

// Invite-only signup, the Invite codes and AI usage sections of Admin, and the
// daily limit on flyer and receipt reading. playwright.config.js lists
// e2e-invites-admin@example.com in ADMIN_EMAILS (signup refuses a listed
// email, so the admin account is made straight in the database, like an
// account that existed before its email was listed). Gemini is never reached:
// the limit is tested by what the server does before it would call Gemini.
const prisma = new PrismaClient();
const ADMIN = "e2e-invites-admin@example.com";
const PASSWORD = "adminpass123";

test.describe.configure({ mode: "serial" });

const emailFor = (prefix) => `${prefix}+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;

async function adminAccount(locale) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.upsert({ where: { email: ADMIN }, update: { passwordHash, locale }, create: { email: ADMIN, passwordHash, locale } });
}

async function member(prefix, locale) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  return prisma.user.create({ data: { email: emailFor(prefix), passwordHash, locale } });
}

async function useToday(user, count) {
  const day = aiDay();
  await prisma.aiUsage.upsert({ where: { userId_day: { userId: user.id, day } }, update: { count }, create: { userId: user.id, day, count } });
}

async function logIn(page, email, password = PASSWORD) {
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.locator('input[type="password"]').press("Enter");
  await expect(page.locator(".app-header")).toBeVisible();
}

// The signup form, filled in and sent (the code first, as the form asks).
async function signUp(page, { email, code, signUpLabel = "Sign up", createLabel = "Create account" }) {
  await page.goto("/");
  await page.getByRole("button", { name: signUpLabel }).click();
  await page.locator('input[name="invite"]').fill(code);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: createLabel }).click();
}

const card = (page, title) => page.locator(".riso-admin-card", { has: page.getByRole("heading", { name: title }) });

test.afterAll(async () => {
  await prisma.appSettings.deleteMany({ where: { id: "app" } }); // back to the default limit
  await prisma.$disconnect();
});

test.describe("on a computer, in English", () => {
  test.use({ viewport: { width: 1280, height: 900 }, locale: "en-CA" });

  test("Matt makes a code, a friend signs up with it, and used, switched-off and unknown codes are refused", async ({ page, browser, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await adminAccount("en");
    await page.goto("/admin");
    await logIn(page, ADMIN);
    const invites = card(page, "Invite codes");

    // The count beside the title is the codes that can still be used (the
    // browser tests' own code is one of them, so count from where it is).
    const usable = invites.locator(".riso-admin-card-head .riso-pill");
    await expect(usable).toBeVisible();
    const before = Number(await usable.textContent());

    // Make a single-use code with a note; it starts as Active, used 0 of 1, expiring in two weeks.
    await invites.getByLabel("Note (optional)").fill("for Emilie");
    await expect(invites.getByRole("group", { name: "How many times it can be used" }).getByRole("button", { name: "Once" })).toHaveClass(/active/);
    await expect(invites.getByRole("group", { name: "Expires" }).getByRole("button", { name: "14 days" })).toHaveClass(/active/);
    await invites.getByRole("button", { name: "Make a code" }).click();
    const first = invites.locator(".riso-admin-code.fresh");
    await expect(first).toBeVisible();
    await expect(first.locator(".riso-admin-code-note")).toHaveText("for Emilie");
    await expect(first.locator(".riso-pill")).toHaveText("Active");
    await expect(first).toContainText("Used 0 of 1");
    await expect(first).toContainText(/Expires \w+ \d+, \d{4}/);
    const code = (await first.locator(".riso-admin-code-text").textContent()).trim();
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    await expect(usable).toHaveText(String(before + 1));

    // Copy puts the code on the clipboard.
    await first.getByRole("button", { name: `Copy the code ${code}` }).click();
    await expect(first.getByRole("button", { name: `Copy the code ${code}` })).toHaveText("✓ Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);

    // A second code, switched off at once: it says Off, loses its Copy button, and can be switched back on.
    const offNote = `switch me off ${Date.now()}`; // unique, so a database kept between runs doesn't confuse the row
    await invites.getByLabel("Note (optional)").fill(offNote);
    await invites.getByRole("button", { name: "Make a code" }).click();
    const second = invites.locator(".riso-admin-code", { hasText: offNote });
    const offCode = (await second.locator(".riso-admin-code-text").textContent()).trim();
    await second.getByRole("button", { name: `Switch off the code ${offCode}` }).click();
    await expect(second.locator(".riso-pill")).toHaveText("Off");
    await expect(second.getByRole("button", { name: /^Copy/ })).toHaveCount(0);
    await expect(second.getByRole("button", { name: "Switch on" })).toBeVisible();

    // A stranger's signup: refused with a clear message, in each of the ways, and no account is made.
    const visitor = await browser.newContext({ locale: "en-CA", viewport: { width: 1280, height: 900 } });
    const stranger = await visitor.newPage();
    const refused = async (attempt, message) => {
      await signUp(stranger, attempt);
      await expect(stranger.locator(".auth-error")).toHaveText(message);
      await expect(stranger.locator(".app-header")).toHaveCount(0);
      expect(await prisma.user.findUnique({ where: { email: attempt.email } })).toBeNull();
    };
    await refused({ email: emailFor("nobody"), code: "WRONGCOD" }, "That invite code doesn't exist. Check it and try again.");
    await refused({ email: emailFor("off"), code: offCode }, "That invite code has been switched off. Ask for a new one.");
    // No code at all: the server says so too (the form also asks for one).
    const none = await stranger.request.post("/api/auth/signup", { data: { email: emailFor("nocode"), password: "testpass123" }, headers: { "X-Lang": "en" } });
    expect(none.status()).toBe(403);
    expect((await none.json()).error).toBe("Signing up needs an invite code. Ask the person who invited you for one.");

    // The real code works however it is typed, and the friend is in.
    const emilie = emailFor("emilie");
    await signUp(stranger, { email: emilie, code: ` ${code.toLowerCase().replace("-", " ")} ` });
    await expect(stranger.locator(".app-header")).toBeVisible();

    // It was single-use: the next person is told it has been used.
    const second_visitor = await browser.newContext({ locale: "en-CA" });
    const another = await second_visitor.newPage();
    const anotherEmail = emailFor("late");
    await signUp(another, { email: anotherEmail, code });
    await expect(another.locator(".auth-error")).toHaveText("That invite code has already been used. Ask for a new one.");
    expect(await prisma.user.findUnique({ where: { email: anotherEmail } })).toBeNull();
    await second_visitor.close();

    // An existing account logs in with just its email and password.
    await (await accountButton(stranger, "Log out")).click();
    await logIn(stranger, emilie, "testpass123");
    await visitor.close();

    // Back in Admin the code shows as used, and who joined with it.
    await page.reload();
    const used = card(page, "Invite codes").locator(".riso-admin-code", { hasText: code });
    await expect(used.locator(".riso-pill")).toHaveText("Used");
    await expect(used).toContainText("Used 1 of 1");
    await expect(used).toContainText(`Joined: ${emilie}`);
    await expect(used.getByRole("button")).toHaveCount(0); // finished: nothing to copy or switch
    // The switched-off code is still off after a reload; switching it on makes it usable.
    const off = card(page, "Invite codes").locator(".riso-admin-code", { hasText: offCode });
    await expect(off.locator(".riso-pill")).toHaveText("Off");
    await off.getByRole("button", { name: "Switch on" }).click();
    await expect(off.locator(".riso-pill")).toHaveText("Active");
  });

  test("an expired code is refused", async ({ page, browser }) => {
    const expired = await prisma.inviteCode.create({ data: { code: "EXP1-RED2", expiresAt: new Date(Date.now() - 60_000) } }).catch(async () => {
      await prisma.inviteCode.deleteMany({ where: { code: "EXP1-RED2" } });
      return prisma.inviteCode.create({ data: { code: "EXP1-RED2", expiresAt: new Date(Date.now() - 60_000) } });
    });
    const visitor = await browser.newContext({ locale: "en-CA" });
    const stranger = await visitor.newPage();
    await signUp(stranger, { email: emailFor("late"), code: expired.code });
    await expect(stranger.locator(".auth-error")).toHaveText("That invite code has expired. Ask for a new one.");

    // Admin lists it as Expired, with nothing to copy.
    await adminAccount("en");
    await page.goto("/admin");
    await logIn(page, ADMIN);
    const row = card(page, "Invite codes").locator(".riso-admin-code", { hasText: expired.code });
    await expect(row.locator(".riso-pill")).toHaveText("Expired");
    await expect(row.getByRole("button")).toHaveCount(0);
    await visitor.close();
    await prisma.inviteCode.delete({ where: { id: expired.id } });
  });

  test("the daily limit: Matt sets it, sees each member's use, and a member at the limit is told so", async ({ page, browser }) => {
    await adminAccount("en");
    const friend = await member("friend", "en");
    await useToday(friend, 2);

    await page.goto("/admin");
    await logIn(page, ADMIN);
    const usage = card(page, "AI usage");
    const input = usage.getByLabel("Readings per account per day");
    await expect(input).toHaveValue("10"); // the default

    // A bad number is refused on the page; a good one is saved and kept.
    await input.fill("1001");
    await usage.getByRole("button", { name: "Save" }).click();
    await expect(usage.getByRole("alert")).toHaveText("Enter a whole number from 0 to 1000.");
    await input.fill("2");
    await usage.getByRole("button", { name: "Save" }).click();
    await expect(usage.getByText("✓ Saved")).toBeVisible();
    await page.reload();
    await expect(card(page, "AI usage").getByLabel("Readings per account per day")).toHaveValue("2");

    // Each member's use today, most used first, the full ones marked.
    const row = card(page, "AI usage").locator("tbody tr", { hasText: friend.email });
    await expect(row.locator("td")).toContainText("2 of 2");
    await expect(row.getByText("Limit reached")).toBeVisible();
    await expect(card(page, "AI usage").locator("tbody tr", { hasText: ADMIN }).locator("td")).toContainText("0 of 2");
    const listed = await card(page, "AI usage").locator("tbody th").allTextContents();
    expect(listed.findIndex((text) => text.includes(friend.email))).toBeLessThan(listed.findIndex((text) => text.includes(ADMIN)));

    // The member at the limit tries to read a flyer: the app says so, in English.
    const visitor = await browser.newContext({ locale: "en-CA", viewport: { width: 1280, height: 900 } });
    const mine = await visitor.newPage();
    await mine.goto("/");
    await logIn(mine, friend.email);
    await mine.getByRole("button", { name: "Flyers", exact: true }).click();
    await mine.getByRole("button", { name: "Upload flyer" }).click();
    await mine.getByLabel("Store (or a name for this upload)").fill("Metro");
    await mine.locator('.riso-upload-form input[type="file"]').setInputFiles({ name: "flyer.png", mimeType: "image/png", buffer: Buffer.from("x") });
    await mine.getByRole("button", { name: "Extract deals" }).click();
    await expect(mine.locator(".riso-upload-form .riso-error")).toHaveText(
      "You've reached today's limit of 2 file readings (flyers and receipts). Try again tomorrow."
    );
    await visitor.close();

    // Setting the limit to 0 pauses reading for everyone, and Admin says so.
    await card(page, "AI usage").getByLabel("Readings per account per day").fill("0");
    await card(page, "AI usage").getByRole("button", { name: "Save" }).click();
    await expect(card(page, "AI usage").getByText("Reading is paused for everyone.")).toBeVisible();
    await expect(card(page, "AI usage").getByText("Limit reached")).toHaveCount(0);
  });
});

test.describe("on a phone, in French", () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: "fr-CA", isMobile: true, hasTouch: true });

  test("signing up asks for the code in French, refuses a wrong one, and Admin fits the screen", async ({ page, browser }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "S'inscrire" }).click();
    await expect(page.getByLabel("Code d'invitation")).toBeVisible();
    await expect(page.getByText("Pour s'inscrire, il faut un code d'invitation.")).toBeVisible();
    await page.locator('input[name="invite"]').fill("ZZZZZZZZ");
    await page.fill('input[type="email"]', emailFor("fr"));
    await page.fill('input[type="password"]', "testpass123");
    await page.getByRole("button", { name: "Créer un compte" }).click();
    await expect(page.locator(".auth-error")).toHaveText("Ce code d'invitation n'existe pas. Vérifiez-le et réessayez.");

    // The server's own answer to no code at all, in French.
    const none = await page.request.post("/api/auth/signup", { data: { email: emailFor("fr-none"), password: "testpass123" }, headers: { "X-Lang": "fr" } });
    expect(none.status()).toBe(403);
    expect((await none.json()).error).toBe(
      "Pour créer un compte, il faut un code d'invitation. Demandez-en un à la personne qui vous a envoyé l'invitation."
    );

    // The shared test code still lets a real signup through.
    await page.locator('input[name="invite"]').fill(E2E_INVITE);
    await page.fill('input[type="email"]', emailFor("fr-ok"));
    await page.getByRole("button", { name: "Créer un compte" }).click();
    await expect(page.locator(".app-header")).toBeVisible();

    // Admin, in French on a phone: both sections work and nothing runs off the screen.
    await adminAccount("fr");
    const admin = await browser.newContext({ locale: "fr-CA", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const phone = await admin.newPage();
    await phone.goto("/admin");
    await logIn(phone, ADMIN);
    const invites = card(phone, "Codes d'invitation");
    await invites.getByLabel("Note (facultatif)").fill("pour Émilie");
    await invites.getByRole("button", { name: "Créer un code" }).click();
    const fresh = invites.locator(".riso-admin-code.fresh");
    await expect(fresh.locator(".riso-pill")).toHaveText("Actif");
    await expect(fresh).toContainText("Utilisé 0 sur 1");
    await expect(fresh).toContainText(/Expire le/);
    await expect(fresh.getByRole("button", { name: /^Copier/ })).toBeVisible();
    await fresh.getByRole("button", { name: /^Désactiver/ }).click();
    await expect(fresh.locator(".riso-pill")).toHaveText("Désactivé");
    await expect(card(phone, "Utilisation de l'IA").getByLabel("Lectures par compte par jour")).toBeVisible();
    expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await admin.close();
  });

  test("a member at the limit is told so in French when reading a receipt", async ({ page }) => {
    await prisma.appSettings.upsert({ where: { id: "app" }, update: { aiDailyLimit: 2 }, create: { id: "app", aiDailyLimit: 2 } });
    const friend = await member("ami", "fr");
    await useToday(friend, 2);
    await page.goto("/");
    await logIn(page, friend.email);
    await page.getByRole("button", { name: "Inventaire", exact: true }).click();
    await page.getByRole("button", { name: "Numériser un reçu" }).click();
    await page.locator('.riso-receipt input[type="file"]').setInputFiles({ name: "recu.png", mimeType: "image/png", buffer: Buffer.from("x") });
    await expect(page.locator(".riso-receipt")).toContainText(
      "Vous avez atteint la limite quotidienne de 2 lectures de fichiers (circulaires et reçus). Réessayez demain."
    );
  });
});
