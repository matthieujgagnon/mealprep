import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { E2E_INVITE } from "./invite.js";

// The Feedback form (avatar menu, Help, "Report a problem", the crash screen) and
// the admin Feedback inbox. playwright.config.js lists the three admins below in
// ADMIN_EMAILS and leaves FEEDBACK_EMAIL_TO unset, so no email is ever sent; an admin
// account is made straight in the database, like the other admin tests. Each test has
// its own admin, because logging in takes the account's saved language and tests run
// side by side.
const prisma = new PrismaClient();
const ADMIN_INBOX = "e2e-feedback-admin@example.com";
const ADMIN_MENU = "e2e-feedback-admin-menu@example.com";
const ADMIN_FRENCH = "e2e-feedback-admin-fr@example.com";
const PASSWORD = "adminpass123";

test.afterAll(async () => {
  await prisma.$disconnect();
});

// One test after the other: the inbox tests look at the whole Feedback table (the number on a pill, and
// "Archive all done" moves every done one), so no other test here may be adding feedback at the same
// moment. No other spec file adds feedback, so those still run beside this one.
test.describe.configure({ mode: "serial" });

function stamp() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

const uniqueEmail = (prefix) => `${prefix}+${stamp()}@example.com`;

async function signUp(page, email, { french = false } = {}) {
  await page.goto("/");
  await page.getByRole("button", { name: french ? "S'inscrire" : "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: french ? "Créer un compte" : "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible();
}

async function openFeedbackFromMenu(page, { french = false } = {}) {
  await page.locator(".app-header").getByRole("button", { name: french ? "Compte" : "Account" }).click();
  await page.getByRole("button", { name: french ? "Envoyer un commentaire" : "Send feedback", exact: true }).click();
  const form = page.getByRole("dialog", { name: french ? "Envoyer un commentaire" : "Send feedback" });
  await expect(form).toBeVisible();
  return form;
}

async function adminAccount(email, locale) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.upsert({ where: { email }, update: { passwordHash, locale }, create: { email, passwordHash, locale } });
}

async function logIn(page, email, password) {
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.locator('input[type="password"]').press("Enter");
  await expect(page.locator(".app-header")).toBeVisible();
}

const rowFor = (message) => prisma.feedback.findFirst({ where: { message }, include: { user: { select: { email: true } } } });

test.describe("on a computer, in English", () => {
  test.use({ viewport: { width: 1280, height: 900 }, locale: "en-CA" });

  test("a tester opens the form in two taps, sends, and gets a thank-you; the details are saved", async ({ page }) => {
    const email = uniqueEmail("fb-en");
    const text = `The planner forgot my lunch ${stamp()}`;
    await signUp(page, email);
    await page.getByRole("button", { name: "Planner", exact: true }).click();

    const form = await openFeedbackFromMenu(page); // the avatar, then "Send feedback"
    await expect(form.getByRole("heading", { name: "Send feedback." })).toBeVisible();
    // Nothing to send yet, and "Other" is the kind to begin with.
    const send = form.getByRole("button", { name: "Send", exact: true });
    await expect(send).toBeDisabled();
    await expect(form.getByRole("button", { name: "Other" })).toHaveAttribute("aria-pressed", "true");
    await expect(form.getByText(/Sent with it, without asking/)).toContainText("Nothing else.");

    await form.getByRole("button", { name: "An idea" }).click();
    await expect(form.getByRole("button", { name: "An idea" })).toHaveAttribute("aria-pressed", "true");
    await form.getByLabel("Your message").fill(text);
    await expect(send).toBeEnabled();
    await send.click();

    await expect(page.locator(".riso-toast")).toHaveText("Thanks!");
    await expect(form).toBeHidden();

    const row = await rowFor(text);
    expect(row).toMatchObject({ kind: "idea", page: "planner", locale: "en", device: "computer", screen: "1280x900", doneAt: null, errorName: null });
    expect(row.user.email).toBe(email);
    expect(row.browser).toMatch(/^Chrome \d+ on Linux$/);
    expect(row.appVersion).toMatch(/^([0-9a-f]{7}|dev)$/);
  });

  test("a failed send says so and keeps the text; sending again works", async ({ page }) => {
    await signUp(page, uniqueEmail("fb-fail"));
    const text = `Lost words ${stamp()}`;
    const form = await openFeedbackFromMenu(page);
    await form.getByLabel("Your message").fill(text);

    // The server is down: the form stays open with the text and a clear message.
    await page.route("**/api/feedback", (route) => route.fulfill({ status: 500, json: { error: "Something went wrong - please try again." } }));
    await form.getByRole("button", { name: "Send", exact: true }).click();
    await expect(form.getByRole("alert")).toHaveText("Couldn't send it. Your text is still here: try again.");
    await expect(form.getByLabel("Your message")).toHaveValue(text);
    expect(await rowFor(text)).toBeNull();

    // No connection at all: the same.
    await page.unroute("**/api/feedback");
    await page.route("**/api/feedback", (route) => route.abort("connectionrefused"));
    await form.getByRole("button", { name: "Send", exact: true }).click();
    await expect(form.getByRole("alert")).toHaveText("Couldn't send it. Your text is still here: try again.");
    await expect(form.getByLabel("Your message")).toHaveValue(text);

    // The server's own words for "you've sent a lot" are shown as they are.
    await page.unroute("**/api/feedback");
    await page.route("**/api/feedback", (route) => route.fulfill({ status: 429, json: { error: "You've sent a few already. Please wait a few minutes before sending more." } }));
    await form.getByRole("button", { name: "Send", exact: true }).click();
    await expect(form.getByRole("alert")).toHaveText("You've sent a few already. Please wait a few minutes before sending more.");
    await expect(form.getByLabel("Your message")).toHaveValue(text);

    // Back online: the same text goes.
    await page.unroute("**/api/feedback");
    await form.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator(".riso-toast")).toHaveText("Thanks!");
    expect(await rowFor(text)).not.toBeNull();
  });

  test("closing with words asks first; closing with nothing doesn't; Escape closes only the form", async ({ page }) => {
    await signUp(page, uniqueEmail("fb-discard"));
    const form = await openFeedbackFromMenu(page);
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(form).toBeHidden();

    const again = await openFeedbackFromMenu(page);
    await again.getByLabel("Your message").fill("half a thought");
    await again.getByRole("button", { name: "Cancel" }).click();
    const ask = page.getByRole("alertdialog", { name: "Throw away what you wrote?" });
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: "Keep writing" }).click();
    await expect(again.getByLabel("Your message")).toHaveValue("half a thought");

    await page.keyboard.press("Escape");
    await expect(ask).toBeVisible();
    await page.keyboard.press("Escape"); // the question's own Escape: keep writing
    await expect(ask).toBeHidden();
    await expect(again).toBeVisible();

    await again.getByRole("button", { name: "Cancel" }).click();
    await ask.getByRole("button", { name: "Discard" }).click();
    await expect(again).toBeHidden();
    expect(await prisma.feedback.count({ where: { message: "half a thought" } })).toBe(0);
  });

  test("the box stops at 2,000 characters and counts near the limit", async ({ page }) => {
    await signUp(page, uniqueEmail("fb-limit"));
    const form = await openFeedbackFromMenu(page);
    const box = form.getByLabel("Your message");
    await expect(box).toHaveAttribute("maxlength", "2000");
    await box.fill("a".repeat(1799));
    await expect(form.getByText(/\/ 2000/)).toHaveCount(0);
    await box.fill("a".repeat(1800));
    await expect(form.getByText("1800 / 2000")).toBeVisible();
  });

  test("Help says how, and its last card opens the same form", async ({ page }) => {
    await signUp(page, uniqueEmail("fb-help"));
    await page.locator(".app-header").getByRole("button", { name: "Account" }).click();
    await page.getByRole("button", { name: "Help", exact: true }).click();

    const account = page.locator("#help-account");
    await expect(account).toContainText("Something wrong, or an idea?");
    // The sentence draws a small copy of the menu's button (never a real button).
    await expect(account.locator(".btn.subtle", { hasText: "Send feedback" }).first()).toBeVisible();
    await expect(account).toContainText("It sends no screenshots and nothing from your recipes or Inventory.");

    const card = page.locator("#help-feedback");
    await expect(card.getByRole("heading", { name: "Something wrong, or an idea?" })).toBeVisible();
    await card.getByRole("button", { name: "Send feedback" }).click();
    const form = page.getByRole("dialog", { name: "Send feedback" });
    await expect(form).toBeVisible();
    await form.getByLabel("Your message").fill(`From Help ${stamp()}`);
    await form.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator(".riso-toast")).toHaveText("Thanks!");
    const sent = await prisma.feedback.findFirst({ where: { user: { email: { startsWith: "fb-help+" } } }, orderBy: { createdAt: "desc" } });
    expect(sent.page).toBe("help");
  });

  test("Report a problem sits beside the load error and reports it as something wrong", async ({ page }) => {
    // The Planner can't be read when the app opens: the red bar appears.
    await page.route((url) => url.pathname === "/api/planner", (route) => route.fulfill({ status: 500, json: { error: "x" } }));
    await signUp(page, uniqueEmail("fb-banner"));
    const banner = page.locator(".load-error-banner");
    await expect(banner).toContainText("Couldn't load everything");
    await banner.getByRole("button", { name: "Report a problem" }).click();

    const form = page.getByRole("dialog", { name: "Send feedback" });
    await expect(form.getByRole("button", { name: "Something's wrong" })).toHaveAttribute("aria-pressed", "true");
    const text = `The bar showed up ${stamp()}`;
    await form.getByLabel("Your message").fill(text);
    await form.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator(".riso-toast")).toHaveText("Thanks!");
    expect(await rowFor(text)).toMatchObject({ kind: "wrong", errorName: "LoadError", page: "home" });
  });

  test("when the app breaks, a calm page with Reload and Report a problem; the report has the page and the error's name only", async ({ page }) => {
    // The upcoming meals come back as something that isn't a list, so drawing a page throws.
    const upcoming = (url) => url.pathname === "/api/planner/upcoming";
    await page.route(upcoming, (route) => route.fulfill({ status: 200, json: { not: "a list of meals for matt@example.com" } }));
    const email = uniqueEmail("fb-crash");
    await page.goto("/");
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', "testpass123");
    await page.fill('input[name="invite"]', E2E_INVITE);
    await page.getByRole("button", { name: "Create account" }).click();

    const crash = page.locator(".riso-crash");
    await expect(crash.getByRole("heading", { name: "Something went wrong." })).toBeVisible();
    await expect(crash).toContainText("What you already saved is safe.");

    await crash.getByRole("button", { name: "Report a problem" }).click();
    const form = page.getByRole("dialog", { name: "Send feedback" });
    await expect(form.getByRole("button", { name: "Something's wrong" })).toHaveAttribute("aria-pressed", "true");
    const text = `It went blank ${stamp()}`;
    await form.getByLabel("Your message").fill(text);
    await form.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator(".riso-toast")).toHaveText("Thanks!");

    const row = await rowFor(text);
    expect(row).toMatchObject({ kind: "wrong", page: "home", locale: "en" });
    expect(row.errorName).toMatch(/^[A-Za-z]+Error$/);
    expect(JSON.stringify(row)).not.toContain("matt@example.com");

    // Reload gets the app back once the problem is gone.
    await page.unroute(upcoming);
    await crash.getByRole("button", { name: "Reload" }).click();
    await expect(page.locator(".tab.active")).toBeVisible();
    await expect(crash).toHaveCount(0);
  });
});

test.describe("on a phone, in French", () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: "fr-CA" });

  test("the form is a sheet in Quebec French, nothing is cut off, and « Merci! » follows", async ({ page }) => {
    const email = uniqueEmail("fb-fr");
    const text = `La liste d'épicerie est vide ${stamp()}`;
    await signUp(page, email, { french: true });

    const form = await openFeedbackFromMenu(page, { french: true });
    await expect(form.getByRole("heading", { name: "Envoyer un commentaire." })).toBeVisible();
    await expect(form.getByRole("button", { name: "Quelque chose ne marche pas" })).toBeVisible();
    await expect(form.getByRole("button", { name: "Une idée" })).toBeVisible();
    await expect(form.getByRole("button", { name: "Autre" })).toBeVisible();
    await expect(form.getByLabel("Votre message")).toBeVisible();
    await expect(form).toContainText("Rien d'autre.");

    // The sheet fits the phone: no sideways scroll, and no label or button runs out of its box.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const cut = await form.evaluate((sheet) => {
      const box = sheet.getBoundingClientRect();
      return [...sheet.querySelectorAll("button, label, legend, h2, p, textarea")]
        .filter((el) => el.offsetParent && (el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > box.right + 1))
        .map((el) => el.textContent.trim().slice(0, 40));
    });
    expect(cut).toEqual([]);

    await form.getByRole("button", { name: "Quelque chose ne marche pas" }).click();
    await form.getByLabel("Votre message").fill(text);
    await form.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(page.locator(".riso-toast")).toHaveText("Merci!");
    await expect(form).toBeHidden();

    const row = await rowFor(text);
    expect(row).toMatchObject({ kind: "wrong", locale: "fr", device: "phone", screen: "390x844", page: "home" });
    expect(row.browser).toMatch(/Chrome/);
  });
});

test.describe("the Feedback inbox", () => {
  test.use({ viewport: { width: 1280, height: 900 }, locale: "en-CA" });

  const feedbackBase = (userId) => ({ userId, locale: "en", device: "computer", screen: "1280x800", browser: "Chrome 126 on Windows", appVersion: "a1b2c3d" });
  const tabButton = (page, name) => page.locator(".riso-fbi-tabs button", { hasText: name });
  // The number on a pill is the same as the database's count (read again until they agree, so a row
  // another test adds in between doesn't matter).
  const expectCount = (pill, dbCount) => expect.poll(async () => `${(await pill.innerText()).trim()}|${await dbCount()}`).toMatch(/^(\d+)\|\1$/);
  const archivedCount = () => prisma.feedback.count({ where: { archivedAt: { not: null } } });
  const inboxCount = () => prisma.feedback.count({ where: { archivedAt: null } });
  const toDoCount = () => prisma.feedback.count({ where: { archivedAt: null, doneAt: null } });

  test("an admin reads everything newest first, with who, the details and a Done tick that stays", async ({ page }) => {
    await adminAccount(ADMIN_INBOX, "en");
    const mark = stamp();
    const tester = await prisma.user.create({ data: { email: uniqueEmail("fb-inbox"), passwordHash: "x" } });
    const base = { userId: tester.id, locale: "fr", device: "phone", screen: "390x844", browser: "Safari 17 on iOS", appVersion: "a1b2c3d" };
    await prisma.feedback.createMany({
      data: [
        { ...base, kind: "wrong", message: `Older one ${mark}\nwith a second line`, page: "grocery", createdAt: new Date(Date.now() - 3 * 86400000) },
        { ...base, kind: "idea", message: `Newer one ${mark}`, page: "planner", errorName: "TypeError", createdAt: new Date(Date.now() - 60000) },
      ],
    });

    await page.goto("/admin/feedback");
    await logIn(page, ADMIN_INBOX, PASSWORD);
    await expect(page.getByRole("heading", { name: "What people told us." })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/feedback$/);

    const newer = page.locator(".riso-fbi-item", { hasText: `Newer one ${mark}` });
    const older = page.locator(".riso-fbi-item", { hasText: `Older one ${mark}` });
    await expect(newer).toContainText("An idea");
    await expect(newer).toContainText(`From ${tester.email}`);
    await expect(newer).toContainText("Planner");
    await expect(newer.locator(".riso-fbi-detail", { hasText: "Language" })).toContainText("FR");
    await expect(newer).toContainText("Phone · 390×844");
    await expect(newer).toContainText("Safari 17 on iOS");
    await expect(newer).toContainText("a1b2c3d");
    await expect(newer).toContainText("TypeError");
    await expect(older).toContainText("Something's wrong");
    await expect(older).toContainText("with a second line");
    // Newest first.
    const order = await page.locator(".riso-fbi-item").evaluateAll((items, m) => items.map((el) => el.textContent.includes(`Newer one ${m}`) ? "newer" : el.textContent.includes(`Older one ${m}`) ? "older" : "other").filter((x) => x !== "other"), mark);
    expect(order).toEqual(["newer", "older"]);

    // Done: ticked, kept after a reload, and un-ticked.
    // The "to do" pill is the server's own count of the inbox's not-done ones (it counts a row another
    // test adds at the same moment too), so it is compared with the database, not with "before minus one".
    const pill = page.locator(".riso-admin-card-head .riso-pill");
    await expectCount(pill, toDoCount);
    const done = newer.getByRole("button", { name: `Mark the feedback from ${tester.email} as done` });
    await done.click();
    await expect(newer.getByRole("button", { name: /as not done/ })).toHaveAttribute("aria-pressed", "true");
    await expectCount(pill, toDoCount);
    await page.reload();
    await expect(page.locator(".riso-fbi-item", { hasText: `Newer one ${mark}` }).getByRole("button", { name: /as not done/ })).toBeVisible();
    expect((await prisma.feedback.findFirst({ where: { message: `Newer one ${mark}` } })).doneAt).toBeInstanceOf(Date);
    await page.locator(".riso-fbi-item", { hasText: `Newer one ${mark}` }).getByRole("button", { name: /as not done/ }).click();
    await expect(page.locator(".riso-fbi-item", { hasText: `Newer one ${mark}` }).getByRole("button", { name: /as done/ })).toBeVisible();
    expect((await prisma.feedback.findFirst({ where: { message: `Newer one ${mark}` } })).doneAt).toBeNull();

    await page.screenshot({ path: test.info().outputPath("inbox.png"), fullPage: true });
  });

  test("the avatar menu has the inbox for an admin, next to Admin, and Back and Forward move between the pages", async ({ page }) => {
    await adminAccount(ADMIN_MENU, "en");
    await page.goto("/");
    await logIn(page, ADMIN_MENU, PASSWORD);
    await page.locator(".app-header").getByRole("button", { name: "Account" }).click();
    const names = await page.locator(".app-header-avatar-menu button").allInnerTexts();
    expect(names).toEqual(["Help", "Send feedback", "Admin", "Feedback inbox", "Log out"]);
    await page.getByRole("button", { name: "Feedback inbox" }).click();
    await expect(page).toHaveURL(/\/admin\/feedback$/);
    await page.locator(".app-header").getByRole("button", { name: "Account" }).click();
    await page.getByRole("button", { name: "Admin", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/feedback$/);
    await expect(page.getByRole("heading", { name: "What people told us." })).toBeVisible();
  });

  test("a tester doesn't see the inbox, is refused on its address, and the routes answer 401 and 403", async ({ page, browser }) => {
    await signUp(page, uniqueEmail("fb-member"));
    await page.locator(".app-header").getByRole("button", { name: "Account" }).click();
    expect(await page.locator(".app-header-avatar-menu button").allInnerTexts()).toEqual(["Help", "Send feedback", "Log out"]);

    await page.goto("/admin/feedback");
    await expect(page.getByRole("alert")).toContainText("Not allowed.");
    await expect(page.locator(".riso-fbi-item")).toHaveCount(0);

    // The server says no whatever the screen shows.
    expect((await page.request.get("/api/admin/feedback")).status()).toBe(403);
    expect((await page.request.patch("/api/admin/feedback/nope", { data: { done: true } })).status()).toBe(403);
    const visitor = await browser.newContext();
    expect((await visitor.request.get("http://localhost:4000/api/admin/feedback")).status()).toBe(401);
    expect((await visitor.request.patch("http://localhost:4000/api/admin/feedback/nope", { data: { done: true } })).status()).toBe(401);
    expect((await visitor.request.post("http://localhost:4000/api/feedback", { data: { message: "hi", kind: "idea" } })).status()).toBe(401);
    await visitor.close();
  });

  test("Archive moves an item out of the inbox into the Archive tab with a toast; Undo brings it back; Back to inbox moves it again", async ({ page }) => {
    await adminAccount(ADMIN_INBOX, "en");
    const mark = stamp();
    const tester = await prisma.user.create({ data: { email: uniqueEmail("fb-arch"), passwordHash: "x" } });
    await prisma.feedback.createMany({
      data: [
        { ...feedbackBase(tester.id), kind: "idea", message: `Stay put ${mark}`, page: "home" },
        { ...feedbackBase(tester.id), kind: "wrong", message: `Archive me ${mark}`, page: "grocery" },
      ],
    });
    const stored = () => prisma.feedback.findFirst({ where: { message: `Archive me ${mark}` } });
    await page.goto("/admin/feedback");
    await logIn(page, ADMIN_INBOX, PASSWORD);
    const item = page.locator(".riso-fbi-item", { hasText: `Archive me ${mark}` });
    const stay = page.locator(".riso-fbi-item", { hasText: `Stay put ${mark}` });
    const toDo = page.locator(".riso-admin-card-head .riso-pill");
    await expect(item).toBeVisible();

    // Two tabs, each with a count over everything; the Inbox is open.
    await expect(tabButton(page, "Inbox")).toHaveAttribute("aria-pressed", "true");
    await expect(tabButton(page, "Archive")).toHaveAttribute("aria-pressed", "false");
    await expectCount(tabButton(page, "Inbox").locator(".riso-pill"), inboxCount);
    await expectCount(tabButton(page, "Archive").locator(".riso-pill"), archivedCount);
    await expectCount(toDo, toDoCount);

    // Archive: it leaves the inbox at once with a toast, the other stays, Done is not ticked and nothing is deleted.
    await item.getByRole("button", { name: `Archive the feedback from ${tester.email}` }).click();
    await expect(item).toHaveCount(0);
    await expect(stay).toBeVisible();
    await expect(page.locator(".riso-toast")).toContainText("Archived.");
    const archived = await stored();
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(archived.doneAt).toBeNull();
    await expectCount(tabButton(page, "Archive").locator(".riso-pill"), archivedCount);
    await expectCount(toDo, toDoCount); // an archived one is no longer "to do"

    // Undo brings it back to the inbox.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(item).toBeVisible();
    expect((await stored()).archivedAt).toBeNull();
    await expectCount(toDo, toDoCount);

    // Archive again and read it in the Archive tab: it has Back to inbox there, not Archive.
    await item.getByRole("button", { name: `Archive the feedback from ${tester.email}` }).click();
    await expect(item).toHaveCount(0);
    await tabButton(page, "Archive").click();
    await expect(tabButton(page, "Archive")).toHaveAttribute("aria-pressed", "true");
    await expect(item).toBeVisible();
    await expect(stay).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Archive all done/ })).toHaveCount(0); // only the Inbox tab has it
    await expect(item.getByRole("button", { name: /^Archive the feedback/ })).toHaveCount(0);
    const back = item.getByRole("button", { name: `Put the feedback from ${tester.email} back in the inbox` });
    await expect(back).toHaveText("Back to inbox");
    await page.screenshot({ path: test.info().outputPath("archive-tab.png"), fullPage: true });

    // Back to inbox: it leaves the Archive with a toast, and that toast's Undo puts it back there.
    await back.click();
    await expect(item).toHaveCount(0);
    await expect(page.locator(".riso-toast")).toContainText("Back in the inbox.");
    expect((await stored()).archivedAt).toBeNull();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(item).toBeVisible();
    expect((await stored()).archivedAt).toBeInstanceOf(Date);

    // Done and Archive are separate: ticking Done in the Archive moves nothing and the "to do" number stays.
    const toDoBefore = await toDoCount();
    await item.getByRole("button", { name: `Mark the feedback from ${tester.email} as done` }).click();
    await expect(item.getByRole("button", { name: /as not done/ })).toHaveAttribute("aria-pressed", "true");
    await expect(item).toBeVisible();
    expect(await toDoCount()).toBe(toDoBefore);
    await expectCount(toDo, toDoCount);
  });

  test("Archive all done moves only the done ones, and its Undo puts back exactly those", async ({ page }) => {
    await adminAccount(ADMIN_INBOX, "en");
    const mark = stamp();
    const tester = await prisma.user.create({ data: { email: uniqueEmail("fb-all"), passwordHash: "x" } });
    const longAgo = new Date(Date.now() - 5 * 86400000);
    await prisma.feedback.createMany({
      data: [
        { ...feedbackBase(tester.id), kind: "idea", message: `Done one ${mark}`, page: "home", doneAt: new Date() },
        { ...feedbackBase(tester.id), kind: "wrong", message: `Done two ${mark}`, page: "home", doneAt: new Date() },
        { ...feedbackBase(tester.id), kind: "other", message: `Still open ${mark}`, page: "home" },
        { ...feedbackBase(tester.id), kind: "idea", message: `Archived before ${mark}`, page: "home", doneAt: longAgo, archivedAt: longAgo },
      ],
    });
    const find = (name) => prisma.feedback.findFirst({ where: { message: `${name} ${mark}` } });
    const row = (name) => page.locator(".riso-fbi-item", { hasText: `${name} ${mark}` });

    await page.goto("/admin/feedback");
    await logIn(page, ADMIN_INBOX, PASSWORD);
    await expect(row("Done one")).toBeVisible();
    await expect(row("Still open")).toBeVisible();
    await expect(row("Archived before")).toHaveCount(0); // it is in the Archive, not the inbox
    const all = page.getByRole("button", { name: /^Archive all done/ });
    await expect(all).toBeEnabled();

    await all.click();
    await expect(row("Done one")).toHaveCount(0);
    await expect(row("Done two")).toHaveCount(0);
    await expect(row("Still open")).toBeVisible();
    await expect(page.locator(".riso-toast")).toContainText(/\d+ archived\./);
    for (const name of ["Done one", "Done two"]) expect(await find(name)).toMatchObject({ archivedAt: expect.any(Date), doneAt: expect.any(Date) });
    expect((await find("Still open")).archivedAt).toBeNull();
    expect((await find("Archived before")).archivedAt.getTime()).toBe(longAgo.getTime());
    await expect(all).toBeDisabled(); // nothing done is left to move
    await expectCount(tabButton(page, "Archive").locator(".riso-pill"), archivedCount);

    // Undo: the two it moved come back to the inbox, still done; what was archived before stays archived.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(row("Done one")).toBeVisible();
    await expect(row("Done two")).toBeVisible();
    for (const name of ["Done one", "Done two"]) expect(await find(name)).toMatchObject({ archivedAt: null, doneAt: expect.any(Date) });
    expect((await find("Archived before")).archivedAt.getTime()).toBe(longAgo.getTime());
    await expect(row("Archived before")).toHaveCount(0);
    await expectCount(tabButton(page, "Inbox").locator(".riso-pill"), inboxCount);
  });

  test("a tab shows 200 at a time and Show older loads the rest, with the counts over everything", async ({ page }) => {
    await adminAccount(ADMIN_INBOX, "en");
    const mark = stamp();
    const tester = await prisma.user.create({ data: { email: uniqueEmail("fb-pages"), passwordHash: "x" } });
    const sentAt = new Date("2001-02-03T04:05:06.000Z"); // all at one time: the page edge falls among rows with the same time
    await prisma.feedback.createMany({
      data: Array.from({ length: 205 }, (_, i) => ({ ...feedbackBase(tester.id), kind: "other", message: `Old ${i} ${mark}`, page: "home", createdAt: sentAt, archivedAt: new Date() })),
    });
    try {
      await page.goto("/admin/feedback");
      await logIn(page, ADMIN_INBOX, PASSWORD);
      await tabButton(page, "Archive").click();
      const items = page.locator(".riso-fbi-item");
      await expect(items).toHaveCount(200);
      const total = await archivedCount();
      await expect(page.locator(".riso-fbi-more")).toContainText(`Showing 200 of ${total}`);
      await expectCount(tabButton(page, "Archive").locator(".riso-pill"), archivedCount); // all of it, not just the 200

      const older = page.getByRole("button", { name: "Show older" });
      for (let press = 0; press < 30 && (await older.count()) > 0; press++) {
        const shown = await items.count();
        await older.click();
        await expect.poll(() => items.count()).toBeGreaterThan(shown);
      }
      await expect(older).toHaveCount(0);
      await expect(items).toHaveCount(await archivedCount());
      for (const i of [0, 204]) await expect(page.locator(".riso-fbi-item", { hasText: `Old ${i} ${mark}` })).toHaveCount(1); // each exactly once
    } finally {
      await prisma.feedback.deleteMany({ where: { userId: tester.id } });
    }
  });
});

test.describe("the Feedback inbox on a phone, in French", () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: "fr-CA" });

  test("reads French and fits", async ({ page }) => {
    await adminAccount(ADMIN_FRENCH, "fr");
    const mark = stamp();
    const tester = await prisma.user.create({ data: { email: uniqueEmail("fb-inbox-fr"), passwordHash: "x" } });
    await prisma.feedback.create({
      data: { userId: tester.id, kind: "wrong", message: `Ça ne marche pas ${mark}`, page: "inventory", locale: "fr", device: "phone", screen: "390x844", browser: "Safari 17 on iOS", appVersion: "a1b2c3d" },
    });
    await page.goto("/admin/feedback");
    await logIn(page, ADMIN_FRENCH, PASSWORD);
    await expect(page.getByRole("heading", { name: "Ce que les gens nous ont dit." })).toBeVisible();
    const item = page.locator(".riso-fbi-item", { hasText: mark });
    await expect(item).toContainText("Quelque chose ne marche pas");
    await expect(item).toContainText(`De ${tester.email}`);
    await expect(item).toContainText("Inventaire");
    await expect(item).toContainText("Téléphone · 390×844");
    await expect(item.getByRole("button", { name: /comme traité/ })).toHaveText("Traité");

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const cut = await page.evaluate(() =>
      [...document.querySelectorAll(".riso-fbi button, .riso-fbi-from, .riso-fbi-detail, .riso-pill")]
        .filter((el) => el.offsetParent && (el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > window.innerWidth))
        .map((el) => el.textContent.trim().slice(0, 40))
    );
    expect(cut).toEqual([]);
  });

  test("the tabs, Archiver, Remettre dans la boîte and the toast read French and fit", async ({ page }) => {
    await adminAccount(ADMIN_FRENCH, "fr");
    const mark = stamp();
    const tester = await prisma.user.create({ data: { email: uniqueEmail("fb-arch-fr"), passwordHash: "x" } });
    const base = { userId: tester.id, locale: "fr", device: "phone", screen: "390x844", browser: "Safari 17 on iOS", appVersion: "a1b2c3d", page: "grocery" };
    await prisma.feedback.createMany({
      data: [
        { ...base, kind: "wrong", message: `À archiver ${mark}` },
        { ...base, kind: "idea", message: `Déjà traité ${mark}`, doneAt: new Date() },
      ],
    });
    // Nothing is cut off and nothing makes the page wider than the phone.
    const fits = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      const cut = await page.evaluate(() =>
        [...document.querySelectorAll(".riso-fbi button, .riso-fbi-from, .riso-fbi-detail, .riso-pill, .riso-toast, .riso-toast *")]
          .filter((el) => el.offsetParent && (el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > window.innerWidth + 0.5 || el.getBoundingClientRect().left < -0.5))
          .map((el) => el.textContent.trim().slice(0, 40))
      );
      expect(cut).toEqual([]);
    };
    const row = (name) => page.locator(".riso-fbi-item", { hasText: `${name} ${mark}` });

    await page.goto("/admin/feedback");
    await logIn(page, ADMIN_FRENCH, PASSWORD);
    const tabs = page.locator(".riso-fbi-tabs");
    await expect(tabs.getByRole("button", { name: /^Boîte de réception/ })).toHaveAttribute("aria-pressed", "true");
    await expect(tabs.getByRole("button", { name: /^Archives/ })).toBeVisible();
    await expect(tabs.locator(".riso-pill")).toHaveCount(2);
    await expect(row("À archiver").getByRole("button", { name: /^Archiver le commentaire de / })).toHaveText("Archiver");
    const all = page.getByRole("button", { name: /^Archiver tous les traités \(\d+\)$/ });
    await expect(all).toBeEnabled();
    expect((await tabs.boundingBox()).width).toBeLessThanOrEqual(390);
    await fits();
    await page.screenshot({ path: test.info().outputPath("inbox-tabs.png") });

    // Archiver: the French toast with « Annuler » (the shared Undo), then the item is in Archives.
    await row("À archiver").getByRole("button", { name: /^Archiver le commentaire de / }).click();
    await expect(row("À archiver")).toHaveCount(0);
    await expect(page.locator(".riso-toast")).toContainText("Archivé.");
    await expect(page.locator(".riso-toast-undo")).toBeVisible();
    await fits();
    await tabs.getByRole("button", { name: /^Archives/ }).click();
    await expect(row("À archiver")).toBeVisible();
    await expect(row("À archiver").getByRole("button", { name: /^Remettre dans la boîte de réception le commentaire de / })).toHaveText("Remettre dans la boîte");
    await expect(page.getByRole("button", { name: /^Archiver tous les traités/ })).toHaveCount(0);
    await fits();
    await page.screenshot({ path: test.info().outputPath("archive-tab.png") });

    // Back in the inbox the bulk button moves the done one, with the French toast and its count.
    await tabs.getByRole("button", { name: /^Boîte de réception/ }).click();
    await expect(row("Déjà traité")).toBeVisible();
    await expect(all).toBeEnabled();
    await all.click();
    await expect(row("Déjà traité")).toHaveCount(0);
    await expect(row("À archiver")).toHaveCount(0); // it is in the Archive tab
    await expect(page.locator(".riso-toast")).toContainText(/\d+ archivés?\./);
    await expect(all).toBeDisabled();
    await fits();
  });
});
