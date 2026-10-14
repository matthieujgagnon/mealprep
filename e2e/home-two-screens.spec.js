import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";
import { langSwitch } from "./account-menu.js";
import { addDays, quebecDay, quebecDayIn } from "./quebec-day.js";
import { PrismaClient } from "@prisma/client";
import { HOME_FLICK_STOP } from "../client/src/lib/homeScreens.js";

const prisma = new PrismaClient();

// Home as two full screens in one scroller, with a dot for each (design:
// docs/design/riso-v2-home-two-screens/). The scroller fills exactly what is
// left under the header; the page itself never scrolls on Home. It snaps only
// while both screens fit it: on a phone, or in a short window, a screen is taller
// than the window, so it scrolls freely there (a snap point in a tall screen is a
// wall an ordinary swipe bounces back from), and the flick stop keeps a flick from
// flying across the join (HOME_FLICK_STOP; with it off those tests are skipped).
// The dots follow and jump either way. The pure rules are unit-tested in
// lib/homeScreens.test.js.

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

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
// touch events, 16 ms apart, lifted while still moving, so the browser coasts on.
// `dy` is how far the finger travels, in `steps` moves. In Chromium a short flick
// coasts about 370px (less than either phone's window, so it never reaches the
// join from the far end of a screen); a long or a fast one coasts over 850px.
const FLICKS = {
  short: { dy: 80, steps: 4 },
  long: { dy: 460, steps: 8 },
  fast: { dy: 420, steps: 3 },
};
async function flick(page, kind, direction) {
  const { dy, steps } = FLICKS[kind];
  const box = await scroller(page).boundingBox();
  const x = box.x + box.width / 2;
  const y1 = direction === "down" ? box.y + box.height - 30 : box.y + 30;
  const y2 = direction === "down" ? y1 - dy : y1 + dy;
  // Each event carries its own time, exactly 16 ms after the last, so the speed the
  // browser reads (and so how far it coasts) is the same however busy the machine is.
  const cdp = await page.context().newCDPSession(page);
  const t0 = Date.now() / 1000;
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
      unitPrice, unitBasis: "lb", regularPrice, validUntil: quebecDayIn(3), isCurrent: true, createdAt: new Date(),
    })),
  });
  await page.request.post("/api/recipes", {
    data: { title: "Omelette", baseServings: 2, fridgeLifeDays: 1, instructions: ["Cook: Cook the eggs."], ingredients: [{ name: "eggs", quantity: 4, unit: "" }] },
  });
  for (const [name, days] of [["eggs", 2], ["spinach", 1], ["milk", 4], ["yogurt", 6], ["mushrooms", 3]]) {
    await page.request.post("/api/pantry-inventory", { data: { name, quantity: 1, location: "fridge", expiresAt: quebecDayIn(days) } });
  }
  await page.reload();
  for (const card of [".riso-home-proteins", ".riso-home-makeable", ".riso-home-useup"]) {
    await expect(page.locator(`[data-screen="2"] ${card}`)).toBeAttached();
  }
  await expect(page.locator('[data-screen="2"] .riso-protein-list > li')).not.toHaveCount(0);
}

test.describe("a tall window: both screens fit, so it snaps", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("opens on screen 1; the dots follow the scroll and jump when tapped", async ({ page }) => {
    await signUp(page);
    await expect(page.locator(".app")).toHaveClass(/is-home/);
    await expect(scroller(page)).toHaveAttribute("data-snap", "on");
    await expect(scroller(page)).toHaveAttribute("data-flick-stop", "off"); // snapping does that job here
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
    const inDays = (n) => addDays(quebecDay(new Date()), n);
    await prisma.flyerDeal.createMany({
      data: [
        ["Cuisses de poulet | Chicken thighs", "chicken thighs", 2.49, 4.99],
        ["Poitrines de poulet | Chicken breasts", "chicken breasts", 3.99, 7.99],
      ].map(([item, matchName, unitPrice, regularPrice]) => ({
        userId, store: "Metro", source: "Metro", category: "protein", item, matchName, price: `$${unitPrice}/lb`,
        unitPrice, unitBasis: "lb", regularPrice, validUntil: inDays(3), isCurrent: true, createdAt: new Date(),
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
    const thursday = new Date(`${mondayOf(new Date())}T12:00:00`);
    thursday.setDate(thursday.getDate() + 3);
    await page.clock.setFixedTime(thursday);
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
// all three cards on screen 2. A flick down from screen 1 stops with the top of
// screen 2 at the top of the scroller; a flick up from screen 2 stops with the end
// of screen 1 at its bottom. A flick that runs out before the join rests where it
// stops (nothing pulls it), a flick inside a screen runs free, and a finger that
// drags across the join is never stopped: no wall.
for (const height of [664, 844]) {
  test.describe(`a phone, 390 x ${height}: a flick stops at the join`, () => {
    test.use({ viewport: { width: 390, height }, hasTouch: true, isMobile: true });
    test.skip(!HOME_FLICK_STOP, "the flick stop is off (HOME_FLICK_STOP in lib/homeScreens.js)");

    test("short, long and fast flicks, down and up, in French", async ({ page }) => {
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
      expect(end1, "screen 1 is taller than the scroller").toBeGreaterThan(0);
      expect(end - s2, "screen 2 is taller than the scroller").toBeGreaterThan(0);
      const near = (what, top, want) => expect(Math.abs(top - want), `${what}: rests at ${top}, not ${want}`).toBeLessThanOrEqual(1);

      // Down from the end of screen 1.
      await park(page, end1);
      const short = await flick(page, "short", "down");
      expect(short, "a short flick moves on").toBeGreaterThan(end1 + 40);
      expect(short, "...and rests short of the join, where it stopped").toBeLessThan(s2 - 1);
      for (const kind of ["long", "fast"]) {
        await park(page, end1);
        near(`a ${kind} flick down from the end of screen 1`, await flick(page, kind, "down"), s2);
        await expect(dot(page, 2, "Écran")).toHaveAttribute("aria-current", "true");
      }
      // From further up screen 1, too.
      await park(page, Math.max(0, end1 - 250));
      near("a fast flick down from further up screen 1", await flick(page, "fast", "down"), s2);

      // From the top of screen 2 the scroll is free all through screen 2.
      await park(page, s2);
      expect(await flick(page, "short", "down")).toBeGreaterThan(s2 + 40);
      await park(page, s2);
      expect(await flick(page, "long", "down")).toBeGreaterThan(s2 + 150);

      // Up from the top of screen 2: back to the end of screen 1.
      await park(page, s2);
      const shortUp = await flick(page, "short", "up");
      expect(shortUp, "a short flick up moves on").toBeLessThan(s2 - 40);
      expect(shortUp, "...and rests short of the join").toBeGreaterThan(end1 + 1);
      for (const kind of ["long", "fast"]) {
        await park(page, s2);
        near(`a ${kind} flick up from the top of screen 2`, await flick(page, kind, "up"), end1);
        await expect(dot(page, 1, "Écran")).toHaveAttribute("aria-current", "true");
      }
      // From deep in screen 2 it runs past the top of screen 2 and stops at the join.
      await park(page, Math.min(end, s2 + 250));
      near("a fast flick up from deep in screen 2", await flick(page, "fast", "up"), end1);

      // From the end of screen 1 the scroll is free all through screen 1.
      await park(page, end1);
      expect(await flick(page, "long", "up")).toBeLessThan(end1 - 150);

      // A finger dragging 240px across the join is never stopped, either way (it
      // moves the scroller a little less: the browser waits for the first few
      // pixels of a touch before it scrolls).
      await park(page, s2 - 120);
      await drag(page, [195, height - 60], [195, height - 300]);
      await page.waitForTimeout(400);
      expect(Math.abs((await scrollTop(page)) - (s2 + 120))).toBeLessThanOrEqual(20);
      await park(page, s2 + 120);
      await drag(page, [195, height - 300], [195, height - 60]);
      await page.waitForTimeout(400);
      expect(Math.abs((await scrollTop(page)) - (s2 - 120))).toBeLessThanOrEqual(20);

      // The dots still jump to the top of each screen.
      await dot(page, 1, "Écran").tap();
      await expect.poll(() => scrollTop(page)).toBe(0);
      await dot(page, 2, "Écran").tap();
      await expect.poll(async () => Math.abs((await scrollTop(page)) - s2)).toBeLessThanOrEqual(1);
      await dot(page, 1, "Écran").tap();
      await expect.poll(() => scrollTop(page)).toBe(0);
    });
  });
}


// The flick stop in a short laptop window, with the wheel or trackpad: a turn that
// would carry the scroller across the join stops there and waits while the wheel
// keeps turning (a trackpad coasts as a stream of wheel events); after a pause, the
// next turn carries on. At 720px tall screen 2 just fits, so going down the join is
// also the end; at 640px both screens are taller than the window.
for (const height of [720, 640]) {
  test.describe(`a short laptop window, 1280 x ${height}: the wheel stops at the join`, () => {
    test.use({ viewport: { width: 1280, height } });
    test.skip(!HOME_FLICK_STOP, "the flick stop is off (HOME_FLICK_STOP in lib/homeScreens.js)");

    test("down and up, then on after a pause; a turn inside a screen is free", async ({ page }) => {
      await signUp(page);
      await seedScreen2(page);
      await expect(scroller(page)).toHaveAttribute("data-snap", "off");
      await expect(scroller(page)).toHaveAttribute("data-flick-stop", "on");
      const s2 = await screen2Top(page);
      const client = await page.evaluate(() => document.querySelector(".home-scroller").clientHeight);
      const end1 = s2 - client;
      const end = await page.evaluate(() => {
        const el = document.querySelector(".home-scroller");
        return el.scrollHeight - el.clientHeight;
      });
      expect(end1, "screen 1 is taller than the window").toBeGreaterThan(40);
      // In the screens' left padding, so no card's own scroll takes the wheel.
      const box = await scroller(page).boundingBox();
      await page.mouse.move(box.x + 16, box.y + box.height / 2);
      const turn = async (dy, times) => {
        for (let i = 0; i < times; i++) {
          await page.mouse.wheel(0, dy);
          await page.waitForTimeout(16);
        }
        return settled(page);
      };
      const near = (what, top, want) => expect(Math.abs(top - want), `${what}: rests at ${top}, not ${want}`).toBeLessThanOrEqual(1);

      // A short turn inside screen 1 is free.
      expect(await turn(40, 3)).toBeGreaterThan(80);

      // Down: a long turn stops at the top of screen 2 and stays while it turns on.
      await park(page, 0);
      near("a long turn down", await turn(40, 40), s2);
      await expect(dot(page, 2)).toHaveAttribute("aria-current", "true");
      if (end > s2 + 40) {
        await page.waitForTimeout(400);
        expect(await turn(40, 5), "after a pause it carries on into screen 2").toBeGreaterThan(s2 + 40);
      }

      // Up: from the end, a long turn stops with the end of screen 1 at the bottom.
      await park(page, end);
      near("a long turn up", await turn(-40, 40), end1);
      await expect(dot(page, 1)).toHaveAttribute("aria-current", "true");
      await page.waitForTimeout(400);
      expect(await turn(-40, 5), "after a pause it carries on up screen 1").toBeLessThan(end1 - 40);

      // The dots still jump to the top of each screen.
      await dot(page, 2).click();
      await expect.poll(async () => Math.abs((await scrollTop(page)) - s2)).toBeLessThanOrEqual(1);
      await dot(page, 1).click();
      await expect.poll(() => scrollTop(page)).toBe(0);
    });
  });
}
