import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_INVITE } from "./invite.js";

const prisma = new PrismaClient();

// Grocery's check feedback (docs/design/riso-v2-grocery-check-feedback/README.md): a checked row
// never leaves its place, every tap shows what changed and where it went (a name chip flying to the
// cart or the store's Add button, the counts, one toast with Undo), taps never wait, and for someone
// who asked for less motion the same information comes through colour. The phone's bottom of the screen
// holds one thing (the docked cart), with the toast above it.

function nextMonday() {
  const x = new Date();
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + 7);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

async function signUp(page, fr = false) {
  await page.goto("/");
  await page.getByRole("button", { name: fr ? "S'inscrire" : "Sign up" }).click();
  await page.fill('input[type="email"]', `check-feedback+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: fr ? "Créer un compte" : "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText(fr ? "Accueil" : "Home");
  const me = await (await page.request.get("/api/auth/me")).json();
  return me.user?.id ?? me.id;
}

// The design's sample list (Super C, Metro, IGA, two items on sale at Metro and one at IGA, two items you
// typed in), and `extra` more typed-in items for a list long enough for twenty taps.
async function seed(page, userId, { extra = 0 } = {}) {
  const recipes = [
    ["Pasta e fagioli", [["diced tomatoes", 2, "can"]]],
    ["Sheet-pan chicken shawarma", [["chicken thighs", 900, "g"]]],
    ["Buttermilk pancakes", [["milk 2%", 750, "ml"]]],
    ["Lentil salad with feta", [["old cheddar, thinly sliced", 350, "g"]]],
    ["Salmon rice bowls", [["salmon fillets", 450, "g"], ["cilantro", 1, "bunch"]]],
  ];
  for (const [i, [title, ingredients]] of recipes.entries()) {
    const r = await (
      await page.request.post("/api/recipes", {
        data: { title, baseServings: 2, ingredients: ingredients.map(([name, quantity, unit]) => ({ name, quantity, unit })) },
      })
    ).json();
    await page.request.post("/api/planner", { data: { recipeId: r.id, weekStart: nextMonday(), dayOfWeek: i, mealType: "dinner" } });
  }
  const deal = (store, item, matchName, price, unitPrice, unitBasis, category) => ({
    userId, store, source: store, category, item, matchName, price, unitPrice, unitBasis, regularPrice: unitPrice * 1.4, isCurrent: true,
  });
  await prisma.flyerDeal.createMany({
    data: [
      deal("Metro", "Tomates en dés Unico | Unico diced tomatoes", "diced tomatoes", "$2.49", 2.49, "each", "pantry"),
      deal("Metro", "Hauts de cuisse de poulet | Chicken thighs", "chicken thighs", "$2.99/lb", 2.99, "lb", "meat"),
      deal("IGA", "Filets de saumon | Salmon fillets", "salmon fillets", "$9.99/lb", 9.99, "lb", "seafood"),
    ],
  });
  await page.request.post("/api/grocery-extra-items", { data: { name: "lemons", quantity: 2 } });
  await page.request.post("/api/grocery-extra-items", { data: { name: "aluminum foil", quantity: 1 } });
  for (let i = 1; i <= extra; i++) await page.request.post("/api/grocery-extra-items", { data: { name: `thing ${String(i).padStart(2, "0")}`, quantity: 1 } });
  const superC = await (await page.request.post("/api/grocery-sections", { data: { name: "Super C" } })).json();
  for (const core of ["old cheddar", "cilantro", "aluminum foil"]) {
    await page.request.post(`/api/grocery-sections/${superC.id}/assign`, { data: { core } });
  }
}

async function openGrocery(page, fr = false) {
  await page.reload();
  await page.getByRole("button", { name: fr ? /^Épicerie$/ : /^Grocery$/ }).first().click();
  await expect(page.locator(".riso-group .riso-row").first()).toBeVisible();
}

const label = (name) => new RegExp(`^(Check off|Cocher) (?:${name})$`, "i");
const box = (page, name) => page.locator(".riso-group").getByRole("checkbox", { name: label(name) }).first();
const row = (page, name) => page.locator(".riso-group .riso-row").filter({ has: page.getByRole("checkbox", { name: label(name) }) }).first();
const savedChecks = async (page) => Object.fromEntries((await (await page.request.get("/api/grocery-checked")).json()).map((r) => [r.core, r]));
const extraKey = async (page, name) => "extra-" + (await (await page.request.get("/api/grocery-extra-items")).json()).find((x) => x.name === name).id;

// Writes down every animation the page starts, as it starts it (a flourish is over in a fraction of a second
// and a busy machine's own steps can take longer): what it is on, which properties it changes, its delay and
// duration, and (for a chip) the number the cart showed when it took off and a moment after it landed.
async function recordAnimations(page) {
  await page.evaluate(() => {
    const start = Element.prototype.animate;
    // The count a chip flies to: Store mode's big number when it is open, else the cart's.
    const cartNumber = () =>
      (document.querySelector(".store-mode-num") || document.querySelector(".riso-grocery-dock-num, .riso-grocery-cartbar-num, .riso-grocery-cart-num") || {}).textContent;
    window.started = [];
    window.chips = 0;
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.classList?.contains("mm-chip")) window.chips++;
    }).observe(document.body, { childList: true, subtree: true });
    Element.prototype.animate = function (keyframes, options) {
      const is = (c) => this.classList.contains(c);
      // The How it works strip has a sample row that checks itself every 1.8 s. It is not a row of the
      // list, so its animations are kept apart: otherwise a slow machine, which takes more than 1.8 s
      // over a test, counts the sample's ✓ as a second one.
      const what = this.closest(".riso-hint-strip")
        ? "hint"
        : is("mm-chip")
        ? "chip"
        : this.hasAttribute("data-gi-mark")
          ? "mark"
          : this.hasAttribute("data-gi-strike")
            ? "strike"
            : this.hasAttribute("data-gi-label")
              ? "label"
              : this.hasAttribute("data-gi-box")
                ? "box"
                : is("riso-group-foot")
                  ? "footer"
                  : is("mm-roll")
                    ? "roll"
                    : is("riso-row") || is("store-mode-row")
                      ? "row"
                      : is("riso-toast-text")
                        ? "toastText"
                        : is("riso-grocery-cart-num") || is("riso-grocery-cartbar-num") || is("riso-grocery-dock-num") || is("store-mode-num")
                          ? "count"
                          : this.className?.toString() || this.tagName;
      const props = [...new Set(keyframes.flatMap((k) => Object.keys(k)).filter((k) => !["offset", "easing", "composite"].includes(k)))].sort();
      const entry = { what, props, duration: options.duration, delay: options.delay, text: this.textContent, cartAtLaunch: cartNumber() };
      window.started.push(entry);
      const animation = start.call(this, keyframes, options);
      if (what === "chip") animation.addEventListener("finish", () => setTimeout(() => (entry.cartAfter = cartNumber()), 80));
      return animation;
    };
  });
}
const started = (page, what) => page.evaluate((w) => window.started.filter((a) => a.what === w), what);

// A slow connection: every save takes a second or so, and not always the same. Gives back the list of
// saves in the order they were sent: "POST <key>", "POST <key> queued" or "DELETE <key>".
async function slowSaves(page) {
  const saves = [];
  await page.route("**/api/grocery-checked**", async (route) => {
    const request = route.request();
    if (request.method() !== "GET" && !request.url().endsWith("/tidy")) {
      const body = request.method() === "POST" ? request.postDataJSON() : null;
      saves.push(body ? `POST ${body.core}${body.queued ? " queued" : ""}` : `DELETE ${decodeURIComponent(request.url().split("/").pop())}`);
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 900));
    }
    await route.fallback();
  });
  return saves;
}
const keysOf = async (page) => Object.fromEntries((await (await page.request.get("/api/grocery-extra-items")).json()).map((x) => [x.name, `extra-${x.id}`]));

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("a checked row never leaves its place, in every view, whatever its step", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    for (const view of ["By store", "By aisle", "By recipe"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      const rows = page.locator(".riso-group").first().locator(".riso-row");
      await expect(rows.first()).toBeVisible();
      const name = await rows.first().locator(".riso-row-name").innerText();
      const top = (await rows.first().boundingBox()).y;
      for (const step of ["1", "2", "0"]) {
        await rows.first().getByRole("checkbox").click();
        await expect(rows.first()).toHaveAttribute("data-step", step);
        // Still the first row of its group, at the same height: it didn't sink, jump or leave.
        await expect(rows.first().locator(".riso-row-name")).toHaveText(name);
        expect(Math.abs((await rows.first().boundingBox()).y - top), `${view} / ${name} at step ${step}`).toBeLessThan(2);
      }
    }
  });

  test("one toast with the item's name and Undo, never stacked; Undo puts back the exact step before", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    const toast = page.locator(".riso-toast");
    const key = await extraKey(page, "lemons");

    await box(page, "lemons").click();
    await expect(toast).toHaveCount(1);
    await expect(toast.locator(".riso-toast-name")).toHaveText("Lemons");
    await expect(toast.locator(".riso-toast-rest")).toHaveText("· in your cart");
    await toast.evaluate((el) => el.setAttribute("data-same", "yes"));

    // Another tap changes the same toast's text; it does not make a second one or come in again.
    await box(page, "aluminum foil").click();
    await expect(toast).toHaveCount(1);
    await expect(toast.locator(".riso-toast-name")).toHaveText("Aluminum foil");
    await expect(toast).toHaveAttribute("data-same", "yes");

    // Undo takes back the last tap only.
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(row(page, "aluminum foil")).toHaveAttribute("data-step", "0");
    await expect(row(page, "lemons")).toHaveAttribute("data-step", "1");
    await expect(toast).toHaveCount(0);

    await box(page, "lemons").click(); // queued
    await expect(toast.locator(".riso-toast-rest")).toHaveText("· queued for inventory");
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(row(page, "lemons")).toHaveAttribute("data-step", "1");
    await box(page, "lemons").click(); // queued
    await box(page, "lemons").click(); // back on the list
    await expect(toast.locator(".riso-toast-rest")).toHaveText("· back on the list");
    await toast.getByRole("button", { name: "Undo" }).click(); // ... exactly where it was: queued, not bought
    await expect(row(page, "lemons")).toHaveAttribute("data-step", "2");
    await expect.poll(async () => (await savedChecks(page))[key]?.queued).toBe(true);
  });

  test("the chip flies to the cart and the count changes when it lands; the box pops and the line draws, on the README's timings", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    await recordAnimations(page);
    await box(page, "Old cheddar").click();
    await expect.poll(async () => (await started(page, "chip")).length).toBe(1);
    const [chip] = await started(page, "chip");
    expect(chip).toMatchObject({ text: "Old cheddar", delay: 160, duration: 260 });
    expect(chip.cartAtLaunch).toBe("0"); // not counted while the chip is on its way
    await expect.poll(async () => (await started(page, "chip"))[0].cartAfter).toBe("1"); // counted when it lands
    await expect(page.locator(".mm-chip")).toHaveCount(0); // and the chip is gone
    await expect(page.locator(".riso-grocery-cart-num")).toHaveText("1");
    // The number bumps as it lands (160 ms), the ✓ pops (160 ms), the line draws (200 ms after 40 ms).
    await expect.poll(async () => (await started(page, "count")).length).toBe(1);
    expect(await started(page, "count")).toMatchObject([{ duration: 160, props: ["transform"] }]);
    expect(await started(page, "mark")).toMatchObject([{ duration: 160, delay: 0 }]);
    expect(await started(page, "strike")).toMatchObject([{ duration: 200, delay: 40, props: ["backgroundSize"] }]);
    expect(await started(page, "row")).toMatchObject([{ duration: 160, delay: 40, props: ["backgroundColor"] }]);

    // Queued: a blue "+ name" chip to the store's Add button (which opens its footer), 120 ms after the tap.
    await box(page, "Old cheddar").click();
    await expect.poll(async () => (await started(page, "chip")).length).toBe(2);
    expect((await started(page, "chip"))[1]).toMatchObject({ text: "+ Old cheddar", delay: 120, duration: 260 });
    await expect(page.locator(".riso-group-foot")).toContainText("1 queued · Old cheddar");
    // The cart doesn't count it twice: a queued item is still in the cart.
    await expect(page.locator(".riso-grocery-cart-num")).toHaveText("1");

    // Back on the list: the count goes down at once and the chip comes back from the cart.
    await box(page, "Old cheddar").click();
    await expect(page.locator(".riso-grocery-cart-num")).toHaveText("0");
    await expect.poll(async () => (await started(page, "chip")).length).toBe(3);
    expect((await started(page, "chip"))[2]).toMatchObject({ text: "Old cheddar", delay: 100, duration: 260 });
  });

  test("Done shopping and the cart never wait for a chip", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    await expect(page.locator(".riso-grocery-cart-btn")).toBeDisabled();
    await box(page, "lemons").click();
    // The shown number is still 0 while the chip flies, but the button already goes by the real cart.
    await expect(page.locator(".riso-grocery-cart-btn")).toBeEnabled({ timeout: 300 });
  });

  test("the store footer opens, rolls its numbers and closes", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    await recordAnimations(page);
    await box(page, "Old cheddar").click();
    await box(page, "Old cheddar").click();
    await expect(page.locator(".riso-group-foot")).toContainText("1 queued · Old cheddar");
    expect(await started(page, "footer")).toMatchObject([{ duration: 200, props: ["borderTopWidth", "height", "opacity", "paddingBottom", "paddingTop"] }]);
    await box(page, "Cilantro").click();
    await box(page, "Cilantro").click();
    await expect(page.locator(".riso-group-foot")).toContainText("2 queued");
    expect((await started(page, "roll")).length).toBeGreaterThan(0); // its numbers roll
    expect((await started(page, "roll"))[0]).toMatchObject({ duration: 160 });
    await box(page, "Old cheddar").click();
    await box(page, "Cilantro").click();
    await box(page, "Cilantro").click(); // all three taps on each: nothing queued any more
    await expect(page.locator(".riso-group-foot")).toHaveCount(0);
  });

  test("for someone who asked for less motion, nothing moves: no chip, only colour and opacity, the count at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    await recordAnimations(page);
    await box(page, "lemons").click();
    await expect(page.locator(".riso-grocery-cart-num")).toHaveText("1");
    await box(page, "lemons").click(); // queued: the footer opens
    await expect(page.locator(".riso-group-foot")).toBeVisible();
    await box(page, "lemons").click(); // back
    await expect(page.locator(".riso-grocery-cart-num")).toHaveText("0");
    await expect(page.locator(".riso-toast .riso-toast-rest")).toHaveText("· back on the list"); // the words still say where it went
    expect(await page.evaluate(() => window.chips)).toBe(0);
    const all = await page.evaluate(() => window.started);
    expect(all.length).toBeGreaterThan(0);
    const moving = all.filter((a) => a.props.some((p) => !["backgroundColor", "opacity"].includes(p)));
    expect(moving, JSON.stringify(moving)).toEqual([]);
    // The row, the cart and the footer flash a colour instead (600 ms).
    const flashed = (what) => all.some((a) => a.duration === 600 && a.props.join() === "backgroundColor" && what.test(a.what));
    expect(flashed(/^row$/)).toBe(true);
    expect(flashed(/riso-grocery-cart/)).toBe(true);
    expect(flashed(/^footer$/)).toBe(true);
  });

  test("slow motion (?slowmo) can't be switched on in the built app", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("mm.slowmo", "4"));
    await page.goto("/?slowmo=4");
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--mm"))).toBe("");
    await recordAnimations(page);
    await box(page, "lemons").click();
    await expect.poll(async () => (await started(page, "chip")).length).toBe(1);
    expect((await started(page, "chip"))[0]).toMatchObject({ delay: 160, duration: 260 }); // not 4 times as long
    expect((await started(page, "strike"))[0]).toMatchObject({ delay: 40, duration: 200 });
  });
});

test.describe("on a short computer window", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the side column stays in view while you scroll: with many sales the sale list scrolls inside its card", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    // Twelve more typed-in items, each with a sale: far more than fit beside the cart in 800 px.
    const foods = ["apples", "bananas", "carrots", "celery", "cucumbers", "eggs", "flour", "grapes", "honey", "oranges", "pears", "rice"];
    for (const name of foods) await page.request.post("/api/grocery-extra-items", { data: { name, quantity: 1 } });
    await prisma.flyerDeal.createMany({
      data: foods.map((name) => ({ userId, store: "Metro", source: "Metro", category: "pantry", item: `${name} | ${name}`, matchName: name, price: "$1.99", unitPrice: 1.99, unitBasis: "each", regularPrice: 2.79, isCurrent: true })),
    });
    await openGrocery(page);
    await page.getByRole("button", { name: "Got it" }).click().catch(() => {});
    const list = page.locator(".riso-grocery-sale-list");
    await expect(list.locator("li")).not.toHaveCount(0);
    expect(await list.locator("li").count()).toBeGreaterThan(8);
    // Scrolled to the middle of a long list, the cart and the whole sale card are still on screen.
    await page.evaluate(() => window.scrollTo(0, 700));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    const box = (sel) => page.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    const cart = await box(".riso-grocery-cart");
    const sale = await box(".riso-grocery-sale");
    expect(cart.top).toBeGreaterThanOrEqual(0);
    expect(sale.bottom).toBeLessThanOrEqual(800);
    // Taller than its room, the list scrolls inside the card.
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(true);
  });
});

test.describe("twenty taps in a row", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("in one burst, all land, the same row's taps count in order, and the saves keep their order", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId, { extra: 24 });
    await openGrocery(page);
    const saves = await slowSaves(page);
    const keys = await keysOf(page);

    // Twenty boxes in one go (no waiting between them), then lemons tapped three times and the foil twice, all
    // inside a single moment of the page's life.
    await page.evaluate(() => {
      const all = () => [...document.querySelectorAll(".riso-group .riso-row-check-hit")];
      all().filter((b) => /thing/i.test(b.getAttribute("aria-label"))).slice(0, 20).forEach((b) => b.click());
      const named = (n) => all().find((b) => b.getAttribute("aria-label").toLowerCase().includes(n));
      for (let i = 0; i < 3; i++) named("lemons").click();
      for (let i = 0; i < 2; i++) named("aluminum").click();
    });
    await expect(page.locator('.riso-row[data-step="1"]')).toHaveCount(20);
    await expect(row(page, "lemons")).toHaveAttribute("data-step", "0"); // three taps: back where it started
    await expect(row(page, "aluminum foil")).toHaveAttribute("data-step", "2"); // two: queued
    await expect(page.locator(".riso-toast")).toHaveCount(1); // never stacked
    // The shown number catches up when the chips have landed.
    await expect(page.locator(".riso-grocery-cart-num")).toHaveText("21", { timeout: 4000 });
    // Every save goes out, one item's in the order of its taps; the server keeps each item's last tap.
    // ... until every save has been sent and has landed (a count of 21 can pass on the way, with the last
    // DELETE still to go).
    await expect.poll(() => saves.length, { timeout: 20000 }).toBe(25);
    await expect
      .poll(async () => {
        const kept = await savedChecks(page);
        return Object.keys(kept).length === 21 && !(keys.lemons in kept) && kept[keys["aluminum foil"]]?.queued === true;
      }, { timeout: 20000 })
      .toBe(true);
    const forItem = (key) => saves.filter((s) => s.split(" ")[1] === key);
    expect(forItem(keys.lemons)).toEqual([`POST ${keys.lemons}`, `POST ${keys.lemons} queued`, `DELETE ${keys.lemons}`]);
    expect(forItem(keys["aluminum foil"])).toEqual([`POST ${keys["aluminum foil"]}`, `POST ${keys["aluminum foil"]} queued`]);
    const kept = await savedChecks(page);
    expect(kept[keys.lemons]).toBeUndefined();
    expect(kept[keys["aluminum foil"]].queued).toBe(true);
    expect(Object.values(kept).filter((r) => !r.queued)).toHaveLength(20);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("twenty quick taps on a slow network all land and keep their order", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId, { extra: 24 });
    await openGrocery(page);
    const saves = await slowSaves(page);
    const keys = await keysOf(page);
    const names = Array.from({ length: 20 }, (_, i) => `thing ${String(i + 1).padStart(2, "0")}`);
    for (const name of names) await box(page, name).tap();
    for (const name of names) await expect(row(page, name)).toHaveAttribute("data-step", "1");
    await expect(page.locator(".riso-toast .riso-toast-name")).toHaveText("Thing 20");
    await expect.poll(async () => Object.keys(await savedChecks(page)).length, { timeout: 20000 }).toBe(20);
    // One save for each, sent in the order they were tapped.
    expect(saves).toEqual(names.map((n) => `POST ${keys[n]}`));
  });

  test("Store mode: the chip flies to the big count, which drops when it lands; a dark toast with Undo", async ({ page }) => {
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    await page.locator(".riso-grocery-cartbar").getByRole("button", { name: /I'm at the store/ }).tap();
    const mode = page.getByRole("dialog", { name: "Store mode" });
    await expect(mode).toBeVisible();
    await recordAnimations(page);
    const count = mode.locator(".store-mode-num");
    const before = Number(await count.textContent());
    const cilantro = mode.locator(".store-mode-row").filter({ hasText: "Cilantro" });
    await cilantro.tap();
    await expect(cilantro).toHaveAttribute("data-step", "1");
    await expect.poll(async () => (await started(page, "chip")).length).toBe(1);
    // Read when the chip took off and a moment after it landed (a look at the screen in between can
    // come too late on a busy machine, once the chip has landed).
    expect((await started(page, "chip"))[0].cartAtLaunch).toBe(String(before)); // not counted while the chip flies
    await expect.poll(async () => (await started(page, "chip"))[0].cartAfter).toBe(String(before - 1)); // counted when it lands
    await expect(count).toHaveText(String(before - 1));
    expect((await started(page, "strike")).every((a) => a.delay === 40 && a.duration === 200)).toBe(true); // the line draws
    const toast = page.locator(".riso-toast");
    await expect(toast).toHaveClass(/store-dark/);
    await expect(toast.locator(".riso-toast-name")).toHaveText("Cilantro");
    await expect(toast.locator(".riso-toast-rest")).toHaveText("· in your cart");
    expect(Math.round(await toast.evaluate((el) => window.innerHeight - el.getBoundingClientRect().bottom))).toBe(24);

    await cilantro.tap(); // out again: the count goes back up at once
    await expect(count).toHaveText(String(before));
    await expect(toast.locator(".riso-toast-rest")).toHaveText("· back on the list");
    await toast.getByRole("button", { name: "Undo" }).tap(); // puts back the exact step before: in the cart
    await expect(cilantro).toHaveAttribute("data-step", "1");
    await expect(count).toHaveText(String(before - 1), { timeout: 3000 });
  });
});

for (const size of [{ width: 390, height: 664 }, { width: 390, height: 844 }]) {
  test.describe(`on a ${size.width} x ${size.height} phone, in French`, () => {
    test.use({ locale: "fr-CA", viewport: size, hasTouch: true, isMobile: true });

    test("one docked cart at the bottom, the toast above it, and the last row always scrolls clear", async ({ page }) => {
      const userId = await signUp(page, true);
      await seed(page, userId);
      await openGrocery(page, true);
      // The old sticky button is gone; « Je suis à l'épicerie » is in the cart bar.
      await expect(page.locator(".riso-grocery-store-btn")).toHaveCount(0);
      const bar = page.locator(".riso-grocery-cartbar");
      await expect(bar.getByRole("button", { name: /Je suis à l'épicerie/ })).toBeVisible();
      await expect(page.locator(".riso-grocery-dock")).toHaveCount(0); // the bar is in view

      // Something queued in two stores, so there are footers, and something in the cart.
      for (const name of ["Old cheddar", "Old cheddar", "Milk 2%", "Milk 2%", "Cilantro"]) await box(page, name).tap();
      await page.getByRole("button", { name: "Compris" }).tap();

      const geometry = () =>
        page.evaluate(() => {
          const rect = (s) => {
            const el = document.querySelector(s);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom };
          };
          const header = document.querySelector(".app-header");
          return { bar: rect(".riso-grocery-cartbar"), dock: rect(".riso-grocery-dock"), toast: rect(".riso-toast"), pinned: header ? header.getBoundingClientRect().bottom : 0, height: window.innerHeight };
        });
      const scrollTo = (y) => page.evaluate((top) => window.scrollTo(0, top), y);
      const last = async () => (await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight));

      for (const view of ["Par magasin", "Par rayon", "Par recette"]) {
        await scrollTo(0);
        await page.getByRole("button", { name: view, exact: true }).tap();
        await expect(page.locator(".riso-group-foot").first()).toBeVisible();
        const end = await last();
        // The dock shows exactly while the bar has scrolled away above the pinned header.
        for (let y = 0; y <= end; y += 90) {
          await scrollTo(y);
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          const g = await geometry();
          await expect.poll(async () => (await page.locator(".riso-grocery-dock").count()) === 1, { message: `${view} at ${y}` }).toBe(g.bar.bottom <= g.pinned + 1);
        }
        // Past the bar: the dock is the one thing at the bottom, with the shop button and Terminé in it.
        await scrollTo(end);
        const dock = page.locator(".riso-grocery-dock");
        await expect(dock).toBeVisible();
        await expect(dock.getByRole("button", { name: "Je suis à l'épicerie" })).toBeVisible();
        await expect(dock.getByRole("button", { name: "Terminé" })).toBeEnabled();
        const g = await geometry();
        // The page ends with room: the last row, the last footer and the sale card all scroll clear above it.
        const lowest = await page.evaluate(() => Math.max(...[...document.querySelectorAll(".riso-grocery-main .riso-group .riso-row, .riso-grocery-main .riso-group-foot, .riso-grocery-sale")].map((el) => el.getBoundingClientRect().bottom)));
        expect(lowest, `${view}: the lowest thing ends at ${lowest}, the dock starts at ${g.dock.top}`).toBeLessThanOrEqual(g.dock.top - 4);
        expect(g.dock.bottom).toBeLessThanOrEqual(g.height);

        // A tap in the middle of the list: its toast sits above the dock and never overlaps it.
        const name = await page.evaluate(() => {
          const row = [...document.querySelectorAll(".riso-group .riso-row")].filter((r) => r.dataset.step === "0").at(-1); // deep in the list, so the bar is far above
          row.scrollIntoView({ block: "center" });
          return row.querySelector(".riso-row-check-hit").getAttribute("aria-label").replace(/^Cocher /, "");
        });
        await box(page, name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).tap();
        await expect(page.locator(".riso-toast")).toBeVisible();
        const after = await geometry();
        expect(after.toast.bottom, `${view}: toast bottom ${after.toast.bottom}, dock top ${after.dock.top}`).toBeLessThanOrEqual(after.dock.top - 8);
        // Taps pass through the toast's body to the page under it; only Undo takes one.
        const through = await page.evaluate(() => {
          const t = document.querySelector(".riso-toast .riso-toast-name").getBoundingClientRect();
          const u = document.querySelector(".riso-toast .riso-toast-undo").getBoundingClientRect();
          const at = (x, y) => document.elementFromPoint(x, y)?.closest(".riso-toast-undo, .riso-toast");
          return { body: !!at(t.left + t.width / 2, t.top + t.height / 2), undo: !!at(u.left + u.width / 2, u.top + u.height / 2) };
        });
        expect(through).toEqual({ body: false, undo: true });
        await page.locator(".riso-toast").getByRole("button", { name: "Annuler" }).tap(); // back to how it was for the next view
      }

      // The shop button in the dock opens Store mode.
      await scrollTo(await last());
      await page.locator(".riso-grocery-dock").getByRole("button", { name: "Je suis à l'épicerie" }).tap();
      await expect(page.getByRole("dialog", { name: "Mode magasin" })).toBeVisible();
    });
  });
}

test.describe("a hard jump down the page, on a phone", () => {
  test.use({ locale: "fr-CA", viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });

  test("the docked cart appears when the bar goes from below the screen to above it in one jump", async ({ page }) => {
    const userId = await signUp(page, true);
    await seed(page, userId);
    await openGrocery(page, true);
    // The page opens with How it works showing, so the cart bar is under the fold: not reached yet, no dock.
    const barTop = await page.locator(".riso-grocery-cartbar").evaluate((el) => el.getBoundingClientRect().top);
    expect(barTop).toBeGreaterThan(700);
    await page.waitForTimeout(500);
    await expect(page.locator(".riso-grocery-dock")).toHaveCount(0);
    // One jump (the End key, a hard flick): the bar never crosses the screen on the way.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator(".riso-grocery-dock")).toBeVisible();
    // And back to the top in one jump: the bar is in view again, so the dock leaves.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.querySelector(".riso-grocery-cartbar").scrollIntoView({ block: "center" }));
    await expect(page.locator(".riso-grocery-dock")).toHaveCount(0);
  });
});

for (const width of [360, 390]) {
  test.describe(`${width} px wide, in French`, () => {
    test.use({ locale: "fr-CA", viewport: { width, height: 700 }, hasTouch: true, isMobile: true });

    test("the cart bar, the dock and the footer's French labels fit their buttons", async ({ page }) => {
      const userId = await signUp(page, true);
      await seed(page, userId);
      await openGrocery(page, true);
      for (const name of ["Old cheddar", "Old cheddar", "Cilantro"]) await box(page, name).tap();
      const overflowing = () =>
        page.evaluate(() =>
          [...document.querySelectorAll(".riso-grocery button, .riso-grocery .riso-group-foot-btn, .riso-grocery-dock button")]
            .filter((b) => b.offsetParent && b.scrollWidth > b.clientWidth + 1)
            .map((b) => b.textContent || b.getAttribute("aria-label"))
        );
      expect(await overflowing()).toEqual([]);
      // The labels are whole, not cut with a … (the shop button's name, and the dock's words).
      const cut = () =>
        page.evaluate(() =>
          [...document.querySelectorAll(".riso-grocery-cartbar-store-name, .riso-grocery-cartbar-store-tag, .riso-grocery-dock-label")].filter((el) => el.offsetParent && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent)
        );
      expect(await cut()).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(page.locator(".riso-grocery-dock")).toBeVisible();
      expect(await overflowing()).toEqual([]);
      expect(await cut()).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      // The dock's own pieces stay inside it.
      const out = await page.evaluate(() => {
        const dock = document.querySelector(".riso-grocery-dock").getBoundingClientRect();
        return [...document.querySelectorAll(".riso-grocery-dock > *")].filter((el) => el.getBoundingClientRect().right > dock.right - 1 || el.getBoundingClientRect().left < dock.left).length;
      });
      expect(out).toBe(0);
    });
  });
}

// The toast says the item's name first: a typical long name (« Papier d'aluminium », "Aluminum foil") is never cut,
// whatever the verb, at the two phone widths that matter, on the list and in Store mode (16 px text, a bigger Undo).
// When name and verb don't both fit on a line, the verb drops under the name.
for (const lang of [
  { code: "fr-CA", fr: true, typed: "papier d'aluminium", shown: "Papier d'aluminium", verbs: ["· dans le panier", "· → inventaire", "· dans la liste"], storeVerbs: ["· dans le panier", "· dans la liste"] },
  { code: "en-CA", fr: false, typed: "aluminum foil", shown: "Aluminum foil", verbs: ["· in your cart", "· queued for inventory", "· back on the list"], storeVerbs: ["· in your cart", "· back on the list"] },
]) {
  for (const width of [360, 390]) {
    test.describe(`${lang.code} toasts at ${width} px`, () => {
      test.use({ locale: lang.code, viewport: { width, height: 800 }, hasTouch: true, isMobile: true });

      test(`the name « ${lang.shown} » is never cut, on the list and in Store mode`, async ({ page }) => {
        const userId = await signUp(page, lang.fr);
        await seed(page, userId);
        if (lang.fr) await page.request.post("/api/grocery-extra-items", { data: { name: lang.typed, quantity: 1 } });
        await openGrocery(page, lang.fr);
        const fits = async (verb) => {
          const toast = page.locator(".riso-toast");
          await expect(toast.locator(".riso-toast-name")).toHaveText(lang.shown);
          await expect(toast.locator(".riso-toast-rest")).toHaveText(verb);
          const m = await toast.evaluate((el) => {
            const name = el.querySelector(".riso-toast-name");
            const rest = el.querySelector(".riso-toast-rest");
            const r = el.getBoundingClientRect();
            const undo = el.querySelector(".riso-toast-undo").getBoundingClientRect();
            return { cut: name.scrollWidth - name.clientWidth, restCut: rest.scrollWidth - rest.clientWidth, left: r.left, right: r.right, height: r.height, undoInside: undo.right <= r.right && undo.left >= r.left, width: innerWidth };
          });
          expect(m.cut, `${verb}: the name needs ${m.cut}px more room`).toBeLessThanOrEqual(1);
          expect(m.restCut, `${verb} is whole`).toBeLessThanOrEqual(1);
          expect(m.left).toBeGreaterThanOrEqual(0);
          expect(m.right).toBeLessThanOrEqual(m.width);
          expect(m.undoInside).toBe(true);
          expect(m.height, "never taller than a two-line pill").toBeLessThanOrEqual(64);
        };

        const checkbox = box(page, lang.typed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        await checkbox.scrollIntoViewIfNeeded();
        for (const verb of lang.verbs) {
          await checkbox.tap();
          await fits(verb);
        }

        // Store mode: bigger text in a narrower pill.
        await page.locator(".riso-grocery-cartbar-store").tap();
        const mode = page.locator(".store-mode");
        await expect(mode).toBeVisible();
        const row = mode.locator(".store-mode-row").filter({ hasText: lang.shown });
        await row.tap();
        await expect(page.locator(".riso-toast")).toHaveClass(/store-dark/);
        await fits(lang.storeVerbs[0]);
        await row.tap();
        await fits(lang.storeVerbs[1]);
      });
    });
  }
}

test.describe("Store mode, for someone who asked for less motion", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a tap checks the row, says so in the toast and the count, flashes a colour, and sends no chip", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const userId = await signUp(page);
    await seed(page, userId);
    await openGrocery(page);
    await page.locator(".riso-grocery-cartbar-store").tap();
    const mode = page.getByRole("dialog", { name: "Store mode" });
    await expect(mode).toBeVisible();
    await recordAnimations(page);
    const count = mode.locator(".store-mode-num");
    const before = Number(await count.textContent());
    const cilantro = mode.locator(".store-mode-row").filter({ hasText: "Cilantro" });
    await cilantro.tap();
    // The app is still there (an earlier version crashed here), the row is checked and the count is at once.
    await expect(page.getByText(/What you already saved is safe/)).toHaveCount(0);
    await expect(cilantro).toHaveAttribute("data-step", "1");
    await expect(count).toHaveText(String(before - 1));
    await expect(page.locator(".riso-toast .riso-toast-rest")).toHaveText("· in your cart");
    expect(await page.evaluate(() => window.chips)).toBe(0);
    // The row and the count's row flash (600 ms), nothing moves.
    const all = await page.evaluate(() => window.started);
    expect(all.some((a) => a.duration === 600 && a.props.join() === "backgroundColor" && a.what === "row")).toBe(true);
    expect(all.filter((a) => a.props.some((p) => !["backgroundColor", "opacity"].includes(p)))).toEqual([]);
    await cilantro.tap(); // out again
    await expect(cilantro).toHaveAttribute("data-step", "0");
    await expect(count).toHaveText(String(before));
    await page.locator(".riso-toast").getByRole("button", { name: "Undo" }).tap();
    await expect(cilantro).toHaveAttribute("data-step", "1");
  });
});
