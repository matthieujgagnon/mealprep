import { expect, realNow, specNow, test, thisMonday } from "./spec-clock.js";
import { E2E_INVITE } from "./invite.js";
import { langSwitch } from "./account-menu.js";
import { addDays, quebecDayIn, quebecMoment } from "./quebec-day.js";
import { PrismaClient } from "@prisma/client";
import { HOME_FLICK_STOP } from "../client/src/lib/homeScreens.js";

const prisma = new PrismaClient();

// Home as two full screens in one scroller, with a dot for each (design:
// docs/design/riso-v2-home-two-screens/). The scroller fills exactly what is
// left under the header; the page itself never scrolls on Home. How it moves is
// scrollMode (lib/homeScreens.js, unit-tested in lib/homeScreens.test.js): a
// computer scrolls freely at every size, with the mouse wheel and the trackpad,
// from anywhere on the page; a touch screen snaps where both screens fit (a
// tablet); a phone scrolls freely and the flick stop keeps a flick from flying
// across the join (HOME_FLICK_STOP; with it off those tests are skipped). The dots
// follow and jump either way.

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `home-screens+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  await expect(page.locator(".home-scroller")).toBeVisible();
}

async function inFrench(page) {
  await langSwitch(page).getByRole("button", { name: "Français" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr-CA");
}

const scroller = (page) => page.locator(".home-scroller");
const scrollTop = (page) => page.evaluate(() => document.querySelector(".home-scroller").scrollTop);
const screen2Top = (page) => page.evaluate(() => document.querySelector('[data-screen="2"]').offsetTop);
const dot = (page, n, label = "Screen") => page.getByRole("button", { name: `${label} ${n}`, exact: true });

// Park the scroller somewhere without the smooth scroll (and without waiting).
const park = (page, top) =>
  page.evaluate((y) => {
    const el = document.querySelector(".home-scroller");
    el.style.scrollBehavior = "auto";
    el.scrollTop = y;
    el.style.scrollBehavior = "";
  }, top);

// Where the scroller comes to rest: the same for 300 ms.
async function settled(page) {
  let now = await scrollTop(page);
  for (let still = 0, i = 0; still < 3 && i < 80; i++) {
    await page.waitForTimeout(100);
    const next = await scrollTop(page);
    still = Math.abs(next - now) < 0.5 ? still + 1 : 0;
    now = next;
  }
  return now;
}

// A finger flicking up the screen (scrolling down) or down it (scrolling up): real
// touch events, lifted while still moving, so the browser coasts on. Each event
// carries its own time, exactly 16 ms after the last, so the speed the browser
// reads is the same however busy the machine is. The finger is in the screens'
// left margin, where nothing but Home scrolls: a card's own list (Use it up) takes
// a swipe that starts on it, and how full it is depends on the fonts.
// How far each kind carries the scroller in all when nothing stops it (Chromium,
// measured on a plain page): gentle about 220px; long about 1,950px; fast 2,270 to
// 2,820px. A finger on the screen is never stopped, so a flick must also start
// further from the join than the finger travels (at most 240px). The checks leave
// wide margins around all of that: a gentle flick starts at least 550px from the
// join it must not reach; a long or fast one starts 400 to 740px from the join it
// must reach.
const FLICKS = {
  gentle: { dy: 60, steps: 4 },
  long: { dy: 240, steps: 5 },
  fast: { dy: 240, steps: 2 },
};
const MARGIN_X = 9; // inside the screens' 18px side padding on a phone
async function flick(page, kind, direction) {
  const { dy, steps } = FLICKS[kind];
  const box = await scroller(page).boundingBox();
  const x = box.x + MARGIN_X;
  const y1 = direction === "down" ? box.y + box.height - 20 : box.y + 20;
  const y2 = direction === "down" ? y1 - dy : y1 + dy;
  const cdp = await page.context().newCDPSession(page);
  const t0 = realNow().getTime() / 1000;
  const send = (type, touchPoints, i) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints, timestamp: t0 + i * 0.016 });
  await send("touchStart", [{ x, y: y1 }], 0);
  for (let i = 1; i <= steps; i++) {
    await send("touchMove", [{ x, y: y1 + ((y2 - y1) * i) / steps }], i);
    await page.waitForTimeout(16);
  }
  await send("touchEnd", [], steps + 0.5);
  return settled(page);
}

// A finger dragging from (x1, y1) to (x2, y2): real touch events.
async function drag(page, [x1, y1], [x2, y2]) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  await send("touchStart", [{ x: x1, y: y1 }]);
  for (let i = 1; i <= 14; i++) {
    await send("touchMove", [{ x: x1 + ((x2 - x1) * i) / 14, y: y1 + ((y2 - y1) * i) / 14 }]);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(160); // hold still before lifting: a drag, not a flick
  await send("touchEnd", []);
}

// All three cards on screen 2: proteins on this week's flyers, a recipe ready to
// cook, and things to use up soon.
async function seedScreen2(page) {
  const me = await (await page.request.get("/api/auth/me")).json();
  const userId = me.user?.id ?? me.id;
  await prisma.flyerDeal.createMany({
    data: [
      ["Cuisses de poulet | Chicken thighs", "chicken thighs", 2.49, 4.99],
      ["Saumon | Salmon", "salmon", 9.99, 14.99],
      ["Porc haché | Ground pork", "ground pork", 3.49, 5.99],
    ].map(([item, matchName, unitPrice, regularPrice]) => ({
      userId, store: "Metro", source: "Metro", category: "protein", item, matchName, price: `$${unitPrice}/lb`,
      unitPrice, unitBasis: "lb", regularPrice, validUntil: quebecDayIn(3, specNow()), isCurrent: true, createdAt: realNow(),
    })),
  });
  await page.request.post("/api/recipes", {
    data: { title: "Omelette", baseServings: 2, fridgeLifeDays: 1, instructions: ["Cook: Cook the eggs."], ingredients: [{ name: "eggs", quantity: 4, unit: "" }] },
  });
  for (const [name, days] of [["eggs", 2], ["spinach", 1], ["milk", 4], ["yogurt", 6], ["mushrooms", 3]]) {
    await page.request.post("/api/pantry-inventory", { data: { name, quantity: 1, location: "fridge", expiresAt: quebecDayIn(days, specNow()) } });
  }
  await page.reload();
  for (const card of [".riso-home-proteins", ".riso-home-makeable", ".riso-home-useup"]) {
    await expect(page.locator(`[data-screen="2"] ${card}`)).toBeAttached();
  }
  await expect(page.locator('[data-screen="2"] .riso-protein-list > li')).not.toHaveCount(0);
}

test.describe("a tall computer window: both screens fit, and it still scrolls freely", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("opens on screen 1; the dots follow the scroll and jump when tapped", async ({ page }) => {
    await signUp(page);
    await expect(page.locator(".app")).toHaveClass(/is-home/);
    // A computer never snaps (the wheel and the trackpad fight a snap) and has no flick stop.
    await expect(scroller(page)).toHaveAttribute("data-snap", "off");
    await expect(scroller(page)).toHaveAttribute("data-flick-stop", "off");
    expect(await scrollTop(page)).toBe(0);

    // The scroller meets the header and ends at the bottom of the window; the page never scrolls.
    const fit = await page.evaluate(() => ({
      headerBottom: document.querySelector(".app-header").getBoundingClientRect().bottom,
      scrollerTop: document.querySelector(".home-scroller").getBoundingClientRect().top,
      scrollerBottom: document.querySelector(".home-scroller").getBoundingClientRect().bottom,
      win: window.innerHeight,
      pageScrolls: document.documentElement.scrollHeight > window.innerHeight,
    }));
    expect(fit.scrollerTop).toBeCloseTo(fit.headerBottom, 0);
    expect(fit.scrollerBottom).toBeCloseTo(fit.win, 0);
    expect(fit.pageScrolls).toBe(false);

    // A dot for each screen, named, the first one current.
    await expect(page.getByRole("navigation", { name: "Home screens" }).getByRole("button")).toHaveCount(2);
    await expect(dot(page, 1)).toHaveAttribute("aria-current", "true");
    await expect(dot(page, 2)).not.toHaveAttribute("aria-current", "true");

    // The cards: screen 1 has the greeting, hero, groceries and week; screen 2 the bottom row.
    await expect(page.locator('[data-screen="1"] .riso-home-week')).toBeVisible();
    await expect(page.locator('[data-screen="2"] .riso-home-proteins')).toBeAttached();
    await expect(page.locator('[data-screen="2"] .riso-home-useup')).toBeAttached();

    await dot(page, 2).click();
    await expect.poll(async () => Math.abs((await scrollTop(page)) - (await screen2Top(page)))).toBeLessThanOrEqual(1);
    await expect(dot(page, 2)).toHaveAttribute("aria-current", "true");
    await expect(dot(page, 1)).not.toHaveAttribute("aria-current", "true");
    await expect(page.locator('[data-screen="2"] .riso-home-proteins')).toBeInViewport();

    await dot(page, 1).click();
    await expect.poll(() => scrollTop(page)).toBe(0);
    await expect(dot(page, 1)).toHaveAttribute("aria-current", "true");
  });

  test("the dots are 24px wide: 34px tall when current, 20px otherwise", async ({ page }) => {
    await signUp(page);
    const size = (n) => dot(page, n).evaluate((el) => [el.offsetWidth, el.offsetHeight]);
    expect(await size(1)).toEqual([24, 34]);
    expect(await size(2)).toEqual([24, 20]);
    const pill = await dot(page, 1).locator("span").evaluate((el) => {
      const c = getComputedStyle(el);
      return [el.offsetWidth, el.offsetHeight, c.borderRadius, c.borderTopWidth];
    });
    expect(pill).toEqual([10, 26, "5px", "2px"]);
  });

  test("the Proteins pop-out opens above everything, and the dots sit under its scrim", async ({ page }) => {
    await signUp(page);
    const me = await (await page.request.get("/api/auth/me")).json();
    const userId = me.user?.id ?? me.id;
    const inDays = (n) => quebecDayIn(n, specNow());
    await prisma.flyerDeal.createMany({
      data: [
        ["Cuisses de poulet | Chicken thighs", "chicken thighs", 2.49, 4.99],
        ["Poitrines de poulet | Chicken breasts", "chicken breasts", 3.99, 7.99],
      ].map(([item, matchName, unitPrice, regularPrice]) => ({
        userId, store: "Metro", source: "Metro", category: "protein", item, matchName, price: `$${unitPrice}/lb`,
        unitPrice, unitBasis: "lb", regularPrice, validUntil: inDays(3), isCurrent: true, createdAt: realNow(),
      })),
    });
    await page.reload();
    await dot(page, 2).click();
    await expect.poll(async () => Math.abs((await scrollTop(page)) - (await screen2Top(page)))).toBeLessThanOrEqual(1);
    const before = await scrollTop(page);

    await page.locator(".riso-protein-list > li button.riso-protein-card").first().click();
    await expect(page.locator(".riso-protein-panel")).toBeVisible();
    const what = await page.evaluate(() => {
      const top = (el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { inside: el.contains(hit), scrim: !!hit?.closest(".riso-protein-scrim") };
      };
      const scrim = document.querySelector(".riso-protein-scrim").getBoundingClientRect();
      return {
        row: top(document.querySelector(".riso-protein-list > li.open .riso-protein-card")),
        panel: top(document.querySelector(".riso-protein-panel")),
        useItUp: top(document.querySelector(".riso-home-useup")),
        dots: top(document.querySelector(".home-dots")),
        header: top(document.querySelector(".app-header")),
        scrim: [scrim.left, scrim.top, scrim.width, scrim.height],
        win: [0, 0, window.innerWidth, window.innerHeight],
      };
    });
    expect(what.row.inside).toBe(true);
    expect(what.panel.inside).toBe(true);
    expect(what.useItUp.scrim).toBe(true);
    expect(what.dots.scrim).toBe(true);
    expect(what.header.scrim).toBe(true);
    expect(what.scrim).toEqual(what.win);

    // Opening a product scrolls its details into view without snapping the page away.
    await page.locator(".riso-protein-pcard").first().click();
    await expect(page.locator(".riso-protein-detail")).toBeInViewport();
    expect(Math.abs((await scrollTop(page)) - before)).toBeLessThan(200);
    await page.keyboard.press("Escape");
    await expect(page.locator(".riso-protein-panel")).toHaveCount(0);
  });

  test("reduced motion: no smooth scrolling and no dot animation", async ({ page }) => {
    await signUp(page);
    const looks = () =>
      page.evaluate(() => ({
        behavior: getComputedStyle(document.querySelector(".home-scroller")).scrollBehavior,
        transition: getComputedStyle(document.querySelector(".home-dot span")).transitionDuration,
      }));
    expect(await looks()).toEqual({ behavior: "smooth", transition: "0.2s, 0.2s" });

    await page.emulateMedia({ reducedMotion: "reduce" });
    const calm = await looks();
    expect(calm.behavior).toBe("auto");
    expect(calm.transition).toMatch(/^0s(, 0s)*$/);
    // Tapping a dot now jumps: the scroller is on screen 2 straight away.
    await dot(page, 2).click();
    await expect.poll(async () => Math.abs((await scrollTop(page)) - (await screen2Top(page))), { timeout: 400 }).toBeLessThanOrEqual(1);
  });

  test("Home always opens on screen 1, and other pages are untouched", async ({ page }) => {
    await signUp(page);
    await dot(page, 2).click();
    await expect(dot(page, 2)).toHaveAttribute("aria-current", "true");

    for (const name of ["Grocery", "Recipes", "Planner", "Inventory"]) {
      await page.locator(".tabs").getByRole("button", { name, exact: true }).click();
      await expect(page.locator(".home-scroller")).toHaveCount(0);
      const shell = await page.locator(".app").evaluate((el) => ({
        home: el.classList.contains("is-home"),
        overflow: getComputedStyle(el).overflow,
        paddingBottom: getComputedStyle(el).paddingBottom,
      }));
      expect(shell, name).toEqual({ home: false, overflow: "visible", paddingBottom: "80px" });
    }

    await page.locator(".tabs").getByRole("button", { name: "Home", exact: true }).click();
    await expect(scroller(page)).toBeVisible();
    expect(await scrollTop(page)).toBe(0);
    await expect(dot(page, 1)).toHaveAttribute("aria-current", "true");
  });
});

test.describe("a short window: a screen is taller than the window, so it scrolls freely", () => {
  test.use({ viewport: { width: 1280, height: 640 } });

  test("no snapping; the scroller rests where it is left, and the dots still follow and jump", async ({ page }) => {
    await signUp(page);
    await expect(scroller(page)).toHaveAttribute("data-snap", "off");
    await expect(scroller(page)).toHaveAttribute("data-flick-stop", "off");
    const tallest = await page.evaluate(() => Math.max(...[...document.querySelectorAll(".home-screen")].map((s) => s.offsetHeight)));
    expect(tallest).toBeGreaterThan(await page.evaluate(() => document.querySelector(".home-scroller").clientHeight));

    // A position in the middle of the way stays put (a snapping scroller would pull it to a screen).
    await park(page, 300);
    await page.waitForTimeout(500);
    expect(await scrollTop(page)).toBe(300);
    await expect(dot(page, 1)).toHaveAttribute("aria-current", "true");

    // The dots light the second screen once half the window has passed its top.
    const s2 = await screen2Top(page);
    const client = await page.evaluate(() => document.querySelector(".home-scroller").clientHeight);
    await park(page, Math.ceil(s2 - client / 2) - 2);
    await expect(dot(page, 1)).toHaveAttribute("aria-current", "true");
    await park(page, Math.ceil(s2 - client / 2) + 2);
    await expect(dot(page, 2)).toHaveAttribute("aria-current", "true");

    await dot(page, 1).click();
    await expect.poll(() => scrollTop(page)).toBe(0);
    await dot(page, 2).click();
    await expect.poll(async () => Math.abs((await scrollTop(page)) - (await screen2Top(page)))).toBeLessThanOrEqual(1);
    await expect(dot(page, 2)).toHaveAttribute("aria-current", "true");
  });
});

// A tablet: a touch screen with room for both screens. Only there does Home snap.
test.describe("a tablet: a touch screen where both screens fit, so it snaps", () => {
  test.use({ viewport: { width: 1280, height: 900 }, hasTouch: true, isMobile: true });

  test("it snaps to a screen, and the dots still follow and jump", async ({ page }) => {
    await signUp(page);
    await expect(scroller(page)).toHaveAttribute("data-snap", "on");
    await expect(scroller(page)).toHaveAttribute("data-flick-stop", "off"); // snapping does that job here
    const s2 = await screen2Top(page);
    // A position in the middle of the way is pulled to a screen.
    await park(page, 300);
    await expect.poll(async () => { const top = await scrollTop(page); return Math.min(Math.abs(top), Math.abs(top - s2)); }).toBeLessThanOrEqual(1);
    await dot(page, 2).tap();
    await expect.poll(async () => Math.abs((await scrollTop(page)) - s2)).toBeLessThanOrEqual(1);
    await expect(dot(page, 2)).toHaveAttribute("aria-current", "true");
    await dot(page, 1).tap();
    await expect.poll(() => scrollTop(page)).toBe(0);
  });
});

test.describe("a phone", () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });

  test("French: named dots, free scrolling, nothing covered, every card reachable", async ({ page }) => {
    test.setTimeout(90_000); // a dozen real swipes
    await signUp(page);
    await inFrench(page);
    await expect(scroller(page)).toHaveAttribute("data-snap", "off");
    await expect(page.getByRole("navigation", { name: "Écrans de l'accueil" })).toBeVisible();
    await expect(dot(page, 1, "Écran")).toHaveAttribute("aria-current", "true");
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(false);

    // The cards keep the design's 18px on each side (more would wrap French headers), and the
    // dots fit in that gutter: 18px wide, flush with the edge.
    const fitted = await page.evaluate(() => ({
      card: document.querySelector(".riso-home-proteins").getBoundingClientRect().width,
      title: document.querySelector(".riso-home-proteins .riso-home-mini-header h3").getBoundingClientRect().height,
      link: document.querySelector(".riso-home-proteins .riso-home-mini-link").getBoundingClientRect().height,
      dotsRight: document.querySelector(".home-dots").getBoundingClientRect().right,
      dotWidth: document.querySelector(".home-dot").getBoundingClientRect().width,
    }));
    expect(fitted).toEqual({ card: 354, title: expect.any(Number), link: expect.any(Number), dotsRight: 390, dotWidth: 18 });
    expect(fitted.title, "the Proteins title is on one line").toBeLessThan(40);
    expect(fitted.link, "« Circulaires → » is on one line").toBeLessThan(24);

    // The dots never cover a card: at the top, in the middle, at the join and at the end,
    // every card stops short of them, and a tap on a card's right edge lands on the card.
    const end = await page.evaluate(() => {
      const el = document.querySelector(".home-scroller");
      return el.scrollHeight - el.clientHeight;
    });
    for (const top of [0, 400, await screen2Top(page), end]) {
      await park(page, top);
      await page.waitForTimeout(150);
      const r = await page.evaluate(() => {
        const dots = document.querySelector(".home-dots").getBoundingClientRect();
        const cards = [...document.querySelectorAll(".home-screen section, .home-screen .riso-home-greeting-title")]
          .map((el) => el.getBoundingClientRect())
          .filter((b) => b.width && b.top < innerHeight && b.bottom > 0);
        const edge = Math.max(...cards.map((b) => b.right));
        const y = dots.top + dots.height / 2;
        const justLeft = document.elementFromPoint(dots.left - 3, y);
        const justRight = document.elementFromPoint(dots.left + 3, y);
        return {
          clear: cards.every((b) => b.right <= dots.left + 0.5),
          gap: Math.round(dots.left - edge),
          leftIsDot: !!justLeft?.closest(".home-dot"),
          rightIsDot: !!justRight?.closest(".home-dot"),
        };
      });
      expect(r.clear, `at ${top}`).toBe(true);
      expect(r.gap, `at ${top}`).toBeGreaterThanOrEqual(-1);
      expect(r.leftIsDot, `at ${top}`).toBe(false);
      expect(r.rightIsDot, `at ${top}`).toBe(true);
    }

    // Ordinary swipes read straight through, with no wall at the join.
    await park(page, 0);
    const stops = [];
    for (let i = 0; i < 16 && (stops.length < 2 || stops[stops.length - 1] !== stops[stops.length - 2]); i++) {
      await drag(page, [195, 630], [195, 410]);
      await page.waitForTimeout(450);
      stops.push(await scrollTop(page));
    }
    expect(stops[stops.length - 1]).toBeGreaterThanOrEqual(end - 1);
    expect(stops.every((s, i) => i === 0 || s >= stops[i - 1])).toBe(true);
    await expect(dot(page, 2, "Écran")).toHaveAttribute("aria-current", "true");

    // A tap on a dot jumps to that screen.
    await dot(page, 1, "Écran").tap();
    await expect.poll(() => scrollTop(page)).toBe(0);
    await dot(page, 2, "Écran").tap();
    await expect.poll(async () => Math.abs((await scrollTop(page)) - (await screen2Top(page)))).toBeLessThanOrEqual(1);
  });

  test("the week strip centres on today and slides sideways without moving the page", async ({ page }) => {
    await signUp(page);
    // A Thursday: today is mid-strip, so it can be centred.
    await page.clock.setFixedTime(quebecMoment(addDays(thisMonday(), 3), 12));
    await page.reload();
    await expect(scroller(page)).toBeVisible();

    const strip = page.locator(".riso-home-week-strip");
    const centred = () =>
      strip.evaluate((el) => {
        const today = el.querySelector(".today");
        const want = today.offsetLeft - (el.clientWidth - today.offsetWidth) / 2;
        return { scrollable: el.scrollWidth > el.clientWidth, left: el.scrollLeft, want };
      });
    await expect.poll(async () => (await centred()).left, { message: "today is brought into the middle" }).toBeGreaterThan(50);
    const c = await centred();
    expect(c.scrollable).toBe(true);
    expect(Math.abs(c.left - c.want)).toBeLessThanOrEqual(2);

    // A sideways swipe moves the strip and only the strip. (On a phone the strip
    // is below the fold at the top, so scroll it into view first.)
    await strip.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const box = await strip.boundingBox();
    expect(box.y).toBeGreaterThan(0);
    expect(box.y + box.height).toBeLessThan(664);
    const y = box.y + box.height / 2;
    const stripBefore = await strip.evaluate((el) => el.scrollLeft);
    const pageBefore2 = await scrollTop(page);
    await drag(page, [box.x + box.width - 30, y], [box.x + 30, y]);
    await page.waitForTimeout(500);
    expect(await strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(stripBefore + 40);
    expect(await scrollTop(page)).toBe(pageBefore2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

// The flick stop on a phone, at a short and a tall iPhone height, in French, with
// all three cards on screen 2. The rule, not the glide: a flick that would cross
// the join stops exactly on it (going down with the top of screen 2 at the top of
// the scroller, going up with the end of screen 1 at its bottom); a flick that runs
// out first rests where it stops; inside a screen it runs free; a finger dragging
// across the join is never stopped (no wall); the dots still jump.
for (const height of [664, 844]) {
  test.describe(`a phone, 390 x ${height}: a flick stops at the join`, () => {
    test.use({ viewport: { width: 390, height }, hasTouch: true, isMobile: true });
    test.skip(!HOME_FLICK_STOP, "the flick stop is off (HOME_FLICK_STOP in lib/homeScreens.js)");

    test("flicks down and up stop at the join, and run free inside a screen, in French", async ({ page }) => {
      test.setTimeout(120_000); // many real flicks
      await signUp(page);
      await inFrench(page);
      await seedScreen2(page);
      await expect(scroller(page)).toHaveAttribute("data-snap", "off");
      await expect(scroller(page)).toHaveAttribute("data-flick-stop", "on");
      const s2 = await screen2Top(page);
      const client = await page.evaluate(() => document.querySelector(".home-scroller").clientHeight);
      const end1 = s2 - client; // screen 1's end at the bottom of the scroller
      const end = await page.evaluate(() => {
        const el = document.querySelector(".home-scroller");
        return el.scrollHeight - el.clientHeight;
      });
      expect(end1, "screen 1 is taller than the scroller").toBeGreaterThan(200);
      expect(end - s2, "screen 2 is taller than the scroller").toBeGreaterThan(40);
      const room2 = Math.min(100, (end - s2) / 2); // how far "free" has to get inside screen 2
      const onJoin = (what, top, want) => expect(Math.abs(top - want), `${what}: rests at ${top}, not on the join at ${want}`).toBeLessThanOrEqual(2);
      const from = async (top, kind, direction) => {
        await park(page, top);
        return flick(page, kind, direction);
      };

      // Down: a flick that would cross the join stops on the top of screen 2.
      for (const kind of ["long", "fast"]) onJoin(`a ${kind} flick down, 400px before the join`, await from(s2 - 400, kind, "down"), s2);
      onJoin("a fast flick down from the end of screen 1", await from(end1, "fast", "down"), s2);
      await expect(dot(page, 2, "Écran")).toHaveAttribute("aria-current", "true");
      // One that runs out first rests where it stops: nothing pulls it on, or back.
      const gentle = await from(end1, "gentle", "down");
      expect(gentle, "a gentle flick down moves on").toBeGreaterThan(end1 + 20);
      expect(gentle, "...and rests short of the join").toBeLessThan(s2 - 2);
      // Inside screen 2 it runs free.
      expect(await from(s2, "gentle", "down"), "free inside screen 2").toBeGreaterThan(s2 + 20);
      expect(await from(s2, "long", "down"), "free inside screen 2").toBeGreaterThan(s2 + room2);

      // Up: a flick that would cross the join stops with the end of screen 1 at the bottom.
      for (const kind of ["long", "fast"]) onJoin(`a ${kind} flick up, 400px before the join`, await from(end1 + 400, kind, "up"), end1);
      onJoin("a fast flick up from the top of screen 2", await from(s2, "fast", "up"), end1);
      await expect(dot(page, 1, "Écran")).toHaveAttribute("aria-current", "true");
      const gentleUp = await from(s2, "gentle", "up");
      expect(gentleUp, "a gentle flick up moves on").toBeLessThan(s2 - 20);
      expect(gentleUp, "...and rests short of the join").toBeGreaterThan(end1 + 2);
      // Inside screen 1 it runs free.
      expect(await from(end1, "gentle", "up"), "free inside screen 1").toBeLessThan(end1 - 20);
      expect(await from(end1, "long", "up"), "free inside screen 1").toBeLessThan(end1 - 100);

      // A finger dragging 240px across the join is never stopped, either way (it moves
      // the scroller a little less: the browser waits for the first few pixels of a
      // touch before it scrolls).
      const box = await scroller(page).boundingBox();
      const x = box.x + MARGIN_X;
      await park(page, s2 - 120);
      await drag(page, [x, height - 60], [x, height - 300]);
      await page.waitForTimeout(400);
      expect(Math.abs((await scrollTop(page)) - (s2 + 120))).toBeLessThanOrEqual(20);
      await park(page, s2 + 120);
      await drag(page, [x, height - 300], [x, height - 60]);
      await page.waitForTimeout(400);
      expect(Math.abs((await scrollTop(page)) - (s2 - 120))).toBeLessThanOrEqual(20);

      // Right after a stop, a tap on a dot still jumps to the top of its screen.
      onJoin("a fast flick down, before the dots", await from(end1, "fast", "down"), s2);
      await dot(page, 1, "Écran").tap();
      await expect.poll(() => scrollTop(page)).toBe(0);
      await dot(page, 2, "Écran").tap();
      await expect.poll(async () => Math.abs((await scrollTop(page)) - s2)).toBeLessThanOrEqual(1);
      await dot(page, 1, "Écran").tap();
      await expect.poll(() => scrollTop(page)).toBe(0);
    });
  });
}

// A computer: Home scrolls freely with the mouse wheel and the trackpad, at every
// size, with the pointer anywhere on the page (Matt's test of Oct 13: a stop at
// the join for the wheel, and the big windows' snap, fought the trackpad; both are
// gone). The test tool's wheel events reach Chrome as pixel steps, the way a
// trackpad sends them: "mouse" is three notches of 100px, "trackpad" thirty
// steps of 8px, 16 ms apart.
const STROKES = {
  mouse: { dy: 100, times: 3, gap: 120 },
  trackpad: { dy: 8, times: 30, gap: 16 },
};

// Every position the scroller passes through, one per frame, while `act` runs and
// until it comes to rest.
async function track(page, act) {
  await page.evaluate(() => {
    const el = document.querySelector(".home-scroller");
    window.__path = [];
    const tick = () => {
      window.__path.push(el.scrollTop);
      window.__frame = requestAnimationFrame(tick);
    };
    tick();
  });
  await act();
  const rest = await settled(page);
  const path = await page.evaluate(() => {
    cancelAnimationFrame(window.__frame);
    return window.__path;
  });
  return { rest, path };
}
// How many frames moved against the scroll (a snap or a stop pulling back).
const backwards = (path, dir) => path.slice(1).filter((top, i) => Math.sign(top - path[i]) === -dir).length;

async function wheelOver(page, point, kind, dir) {
  const { dy, times, gap } = STROKES[kind];
  await page.mouse.move(point.x, point.y);
  return track(page, async () => {
    for (let i = 0; i < times; i++) {
      await page.mouse.wheel(0, dy * dir);
      await page.waitForTimeout(gap);
    }
  });
}

// The middle of the first of `selector` on screen, or null.
async function pointOver(page, selector) {
  return page.evaluate((sel) => {
    const scroller = document.querySelector(".home-scroller").getBoundingClientRect();
    const box = document.querySelector(sel)?.getBoundingClientRect();
    if (!box) return null;
    const y = box.top + Math.min(box.height / 2, 40);
    return y > scroller.top + 4 && y < scroller.bottom - 4 ? { x: box.left + box.width / 2, y } : null;
  }, selector);
}

async function computerHome(page) {
  await signUp(page);
  await seedScreen2(page);
  await expect(scroller(page)).toHaveAttribute("data-snap", "off");
  await expect(scroller(page)).toHaveAttribute("data-flick-stop", "off");
  return page.evaluate(() => {
    const el = document.querySelector(".home-scroller");
    return { s2: document.querySelector('[data-screen="2"]').offsetTop, end: el.scrollHeight - el.clientHeight };
  });
}

for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080], [1000, 800]]) {
  test.describe(`a computer, ${width} x ${height}: the wheel and the trackpad scroll Home freely`, () => {
    test.use({ viewport: { width, height } });

    // Must pass: the case Matt found broken.
    test("with the pointer over Proteins on sale, the wheel and the trackpad scroll Home, both ways", async ({ page }) => {
      const { s2, end } = await computerHome(page);
      const row = ".riso-protein-list > li button.riso-protein-card";
      for (const kind of ["mouse", "trackpad"]) {
        for (const [dir, start] of [[1, Math.max(0, end - 200)], [-1, s2]]) {
          await park(page, start);
          const point = await pointOver(page, row);
          expect(point, `a Proteins row is on screen at ${start}`).not.toBeNull();
          const room = dir > 0 ? end - start : start;
          const { rest, path } = await wheelOver(page, point, kind, dir);
          const want = Math.min(STROKES[kind].dy * STROKES[kind].times, room) / 2;
          expect((rest - start) * dir, `${kind} ${dir > 0 ? "down" : "up"} over Proteins moves Home`).toBeGreaterThan(want);
          expect(backwards(path, dir), `${kind} ${dir > 0 ? "down" : "up"} over Proteins never pulls back`).toBe(0);
        }
      }
    });

    test("from every part of the page, never pulled back, all the way to both ends", async ({ page }) => {
      test.setTimeout(90_000);
      const { s2, end } = await computerHome(page);
      const box = await scroller(page).boundingBox();
      // Screen 1's parts, scrolling down from the top; screen 2's, scrolling up from its top.
      const parts = [
        ["the greeting", ".riso-home-greeting-title", 0, 1],
        ["the hero", ".riso-home-hero", 0, 1],
        ["the Grocery card", ".riso-home-grocery", 0, 1],
        ["the week strip", ".riso-home-week-strip", 0, 1],
        ["Proteins on sale", ".riso-home-proteins", s2, -1],
        ["Makeable now", ".riso-home-makeable", s2, -1],
        ["Use it up", ".riso-home-useup .riso-home-mini-header", s2, -1],
      ];
      for (const [name, selector, start, dir] of parts) {
        for (const kind of ["mouse", "trackpad"]) {
          await park(page, start);
          const point = await pointOver(page, selector);
          expect(point, `${name} is on screen`).not.toBeNull();
          const { rest, path } = await wheelOver(page, point, kind, dir);
          expect((rest - start) * dir, `${kind} over ${name} moves Home`).toBeGreaterThan(40);
          expect(backwards(path, dir), `${kind} over ${name} never pulls back`).toBe(0);
        }
      }
      // From the margin, a long scroll goes all the way down and all the way back up,
      // straight through the join.
      const margin = { x: box.x + 12, y: box.y + box.height / 2 };
      for (const [kind, times] of [["mouse", 14], ["trackpad", 170]]) {
        await park(page, 0);
        await page.mouse.move(margin.x, margin.y);
        const down = await track(page, async () => {
          for (let i = 0; i < times; i++) {
            await page.mouse.wheel(0, STROKES[kind].dy);
            await page.waitForTimeout(STROKES[kind].gap);
          }
        });
        expect(Math.round(down.rest), `${kind}: a long scroll down reaches the end`).toBe(end);
        expect(backwards(down.path, 1)).toBe(0);
        const up = await track(page, async () => {
          for (let i = 0; i < times; i++) {
            await page.mouse.wheel(0, -STROKES[kind].dy);
            await page.waitForTimeout(STROKES[kind].gap);
          }
        });
        expect(Math.round(up.rest), `${kind}: a long scroll up reaches the top`).toBe(0);
        expect(backwards(up.path, -1)).toBe(0);
      }
      // The dots still jump to the top of each screen.
      await dot(page, 2).click();
      await expect.poll(async () => Math.abs((await scrollTop(page)) - s2)).toBeLessThanOrEqual(1);
      await dot(page, 1).click();
      await expect.poll(() => scrollTop(page)).toBe(0);
    });

    test("Use it up's list scrolls first, then hands the wheel on to Home", async ({ page }) => {
      const { s2, end } = await computerHome(page);
      const listSel = ".riso-home-useup-scroll > .riso-home-rows";
      const list = page.locator(listSel);
      expect(await list.evaluate((el) => getComputedStyle(el).overscrollBehaviorY)).toBe("auto");
      const listRoom = await list.evaluate((el) => el.scrollHeight - el.clientHeight);
      expect(listRoom, "the list has more than it shows").toBeGreaterThan(20);
      // Scroll the way Home has room to go: down when screen 2 is taller than the window, else up.
      const dir = end - s2 > 60 ? 1 : -1;
      await park(page, dir > 0 ? s2 : end);
      if (dir < 0) await list.evaluate((el) => (el.scrollTop = el.scrollHeight)); // the list at its bottom, Home's top above
      const start = await scrollTop(page);
      const point = await pointOver(page, listSel);
      expect(point, "the list is on screen").not.toBeNull();
      await page.mouse.move(point.x, point.y);
      // The list moves first, to its end.
      for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, 100 * dir);
        await page.waitForTimeout(60);
      }
      await settled(page);
      await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(dir > 0 ? listRoom : 0);
      // Then, at its end, the wheel moves Home.
      await page.waitForTimeout(300);
      const { rest } = await wheelOver(page, point, "mouse", dir);
      expect((rest - start) * dir, "at the list's end, the wheel moves Home").toBeGreaterThan(40);
    });
  });
}

// Screen 2 fits the window on a computer, as screen 1 does (Matt, Oct 14: with
// every protein on sale it ran off the bottom). The most it ever holds: all
// eight kinds of protein on sale, a recipe ready to cook and ten things to use
// up. Its rows are slimmer on a computer (at least 50px; Use it up's picture
// 42px); a phone keeps the design's 78px rows.
async function seedEverything(page) {
  const me = await (await page.request.get("/api/auth/me")).json();
  const userId = me.user?.id ?? me.id;
  const deals = [
    ["Cuisses de poulet | Chicken thighs", "chicken thighs"],
    ["Boeuf haché | Ground beef", "ground beef"],
    ["Longe de porc | Pork loin", "pork loin"],
    ["Saumon | Salmon", "salmon"],
    ["Crevettes | Shrimp", "shrimp"],
    ["Dinde hachée | Ground turkey", "ground turkey"],
    ["Gigot d'agneau | Lamb leg", "lamb leg"],
    ["Tofu ferme | Firm tofu", "firm tofu"],
  ];
  await prisma.flyerDeal.createMany({
    data: deals.map(([item, matchName], i) => ({
      userId, store: "Metro", source: "Metro", category: "protein", item, matchName, price: `$${3 + i}/lb`,
      unitPrice: 3 + i, unitBasis: "lb", regularPrice: 6 + i, validUntil: quebecDayIn(3, specNow()), isCurrent: true, createdAt: realNow(),
    })),
  });
  await page.request.post("/api/recipes", {
    data: { title: "Omelette", baseServings: 2, fridgeLifeDays: 1, instructions: ["Cook: Cook the eggs."], ingredients: [{ name: "eggs", quantity: 4, unit: "" }] },
  });
  const useUp = ["eggs", "spinach", "milk", "yogurt", "mushrooms", "cream", "cheddar", "lettuce", "ham", "tortillas"];
  for (const [i, name] of useUp.entries()) {
    await page.request.post("/api/pantry-inventory", { data: { name, quantity: 1, location: "fridge", expiresAt: quebecDayIn(1 + i * 2, specNow()) } });
  }
  await page.reload();
  await expect(page.locator('[data-screen="2"] .riso-protein-list > li')).toHaveCount(8);
  await expect(page.locator('[data-screen="2"] .riso-home-makeable')).toBeAttached();
}

for (const [width, height] of [[1280, 720], [1366, 768], [1440, 900], [1536, 864], [1920, 1080]]) {
  test.describe(`a computer, ${width} x ${height}: screen 2 fits the window`, () => {
    test.use({ viewport: { width, height } });

    test("with every protein on sale and ten things to use up", async ({ page }) => {
      await signUp(page);
      await seedEverything(page);
      const fit = await page.evaluate(() => {
        const scroller = document.querySelector(".home-scroller");
        const second = document.querySelector('[data-screen="2"]');
        const box = scroller.getBoundingClientRect();
        scroller.style.scrollBehavior = "auto";
        scroller.scrollTop = second.offsetTop;
        const cards = [".riso-home-proteins", ".riso-home-makeable", ".riso-home-useup"].map((sel) => document.querySelector(sel).getBoundingClientRect());
        return {
          past: scroller.scrollHeight - scroller.clientHeight - second.offsetTop,
          lowestCard: Math.max(...cards.map((c) => c.bottom)),
          windowBottom: box.bottom,
          row: document.querySelector(".riso-protein-card").getBoundingClientRect().height,
          picture: document.querySelector(".riso-useup-row .inv-card-photo").getBoundingClientRect().height,
        };
      });
      expect(fit.past, "nothing of screen 2 is below the window").toBeLessThanOrEqual(1);
      expect(fit.lowestCard, "every card ends inside the window").toBeLessThanOrEqual(fit.windowBottom);
      expect(fit.row).toBe(50);
      expect(await page.evaluate(() => [...document.querySelectorAll(".riso-protein-card, .riso-protein-card *")].filter((el) => el.scrollHeight > el.clientHeight + 1).length), "nothing spills out of a row").toBe(0);
      expect(fit.picture).toBe(42);
      // Use it up still scrolls inside its card when it has more than it shows.
      const list = page.locator(".riso-home-useup-scroll > .riso-home-rows");
      expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    });
  });
}

// French at a narrower window: the long verdict « Faites des réserves » makes
// « Fruits de mer » wrap, and its row grows rather than spill.
test.describe("a computer, 1100 x 780, in French: a wrapped name makes its row taller", () => {
  test.use({ viewport: { width: 1100, height: 780 } });

  test("nothing spills out of a row, and screen 2 still fits", async ({ page }) => {
    await signUp(page);
    await inFrench(page);
    await seedEverything(page);
    const r = await page.evaluate(() => {
      const scroller = document.querySelector(".home-scroller");
      return {
        spills: [...document.querySelectorAll(".riso-protein-card, .riso-protein-card *")].filter((el) => el.scrollHeight > el.clientHeight + 1).length,
        rows: [...document.querySelectorAll(".riso-protein-card")].map((el) => el.getBoundingClientRect().height),
        past: scroller.scrollHeight - scroller.clientHeight - document.querySelector('[data-screen="2"]').offsetTop,
      };
    });
    expect(r.spills).toBe(0);
    expect(Math.min(...r.rows)).toBe(50);
    expect(Math.max(...r.rows), "« Fruits de mer » wraps onto two lines").toBeGreaterThan(50);
    expect(r.past).toBeLessThanOrEqual(1);
  });
});

test.describe("a phone keeps the design's rows", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("78px protein rows, a 56px picture in Use it up", async ({ page }) => {
    await signUp(page);
    await seedEverything(page);
    expect(await page.locator(".riso-protein-card").first().evaluate((el) => el.getBoundingClientRect().height)).toBe(78);
    expect(await page.locator(".riso-useup-row .inv-card-photo").first().evaluate((el) => el.getBoundingClientRect().height)).toBe(56);
  });
});
