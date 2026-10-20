import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";
import { quebecDayIn } from "./quebec-day.js";

// A planned prepared meal is a photo card (design: docs/design/prepared-tag/): the Inventory
// item's photo read live through the link, the 3px ink border and the one shared « plat
// préparé » tag across the photo's bottom edge, on the board, the phone board, the
// calendar's day preview and Home's week strip. The copy of the photo the entry keeps is only
// the fallback once the item has left Inventory. Leftovers typed by hand that have a photo
// are a photo card too, with their yellow border and « restes » sticker.

const PNG_RED = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4FGUDAAOaAXm/ROgEAAAAAElFTkSuQmCC", "base64");
const PNG_GREEN = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPQmBYFAAICARnpe567AAAAAElFTkSuQmCC", "base64");

async function signUp(page, { french = false } = {}) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `ptag+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  if (french) await page.request.patch("/api/auth/me", { data: { locale: "fr" } });
  // A recipe, so the Planner shows its board.
  await page.request.post("/api/recipes", { data: { title: "Stir-fry", mealSlot: "dinner", instructions: ["Cook it."], ingredients: [{ name: "broccoli" }] } });
}

const upload = async (page, body) => (await (await page.request.post("/api/recipe-images", { headers: { "Content-Type": "image/png" }, data: body })).json()).url;
const add = async (page, data) => (await page.request.post("/api/pantry-inventory", { data })).json();

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
const todayIndex = () => (new Date().getDay() + 6) % 7;

// What the app does when a meal from Inventory is planned: a note, then its marks and its link.
async function plan(page, item, { note, mealType = "dinner" }) {
  const entry = await (await page.request.post("/api/planner/blank", { data: { weekStart: mondayOf(new Date()), dayOfWeek: todayIndex(), mealType, note } })).json();
  const linked = await (await page.request.put(`/api/planner/${entry.id}`, { data: { isLeftover: true, leftoverItemId: item.id } })).json();
  return linked;
}

const openPlanner = async (page) => {
  await page.reload();
  await page.getByRole("button", { name: /^(Planner|Planificateur)$/ }).first().click();
};

const box = async (locator) => locator.boundingBox();
const inside = (inner, outer, slack = 1) =>
  inner.x >= outer.x - slack && inner.y >= outer.y - slack && inner.x + inner.width <= outer.x + outer.width + slack && inner.y + inner.height <= outer.y + outer.height + slack;

test.describe("on a computer, in English", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("the card shows the item's photo live, keeps a copy for when it is gone, and wears the tag across the photo's edge", async ({ page }) => {
    await signUp(page);
    const red = await upload(page, PNG_RED);
    const green = await upload(page, PNG_GREEN);
    const lasagna = await add(page, { name: "Lasagna", quantity: 4, unit: "portion", location: "freezer", isPreparedMeal: true, imageUrl: red, expiresAt: quebecDayIn(60) });
    await plan(page, lasagna, { note: "Prepared meal · Lasagna" });
    await openPlanner(page);

    const card = page.locator(".riso-planner-cell .riso-planner-card.linked.prepared");
    await expect(card).toHaveCount(1);
    await expect(card.locator("img.riso-planner-card-photo")).toHaveAttribute("src", red);
    await expect(card.locator(".riso-planner-card-name")).toHaveText("Lasagna");
    await expect(page.locator(".riso-planner-note")).toHaveCount(0); // not the note card

    // 3px of ink, a white well that shows the product whole, and the shared tag (S, +3deg) across the photo's bottom edge.
    expect(await card.evaluate((e) => [getComputedStyle(e).borderTopWidth, getComputedStyle(e).borderTopColor])).toEqual(["3px", "rgb(22, 24, 31)"]);
    const well = card.locator(".riso-planner-card-photo-wrap");
    expect(await well.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(255, 255, 255)");
    expect(await card.locator("img.riso-planner-card-photo").evaluate((e) => getComputedStyle(e).objectFit)).toBe("contain");
    const tag = card.locator(".prepared-tag");
    await expect(tag).toHaveText("prepared meal");
    expect(await tag.evaluate((e) => [e.offsetHeight, getComputedStyle(e).transform])).toEqual([15, "matrix(0.99863, 0.052336, -0.052336, 0.99863, 0, 0)"]);
    const wellBox = await box(well);
    const tagBox = await box(tag);
    expect(tagBox.y).toBeLessThan(wellBox.y + wellBox.height);
    expect(tagBox.y + tagBox.height).toBeGreaterThan(wellBox.y + wellBox.height);
    expect(inside(tagBox, await box(card))).toBe(true);
    // The × is the recipe card's: it removes the meal.
    await expect(card.locator(".riso-planner-card-remove")).toBeVisible();

    // The photo is read live: change it on the item and the card follows.
    await page.request.put(`/api/pantry-inventory/${lasagna.id}`, { data: { imageUrl: green } });
    await openPlanner(page);
    await expect(card.locator("img.riso-planner-card-photo")).toHaveAttribute("src", green);

    // The entry kept a copy of the new photo; once the item has left Inventory, that copy keeps the card's picture.
    const today = mondayOf(new Date());
    const entry = async () => (await (await page.request.get(`/api/planner?week=${today}`)).json()).find((e) => e.isLeftover);
    expect((await entry()).photoUrl).toBe(green);
    await page.request.delete(`/api/pantry-inventory/${lasagna.id}`);
    await openPlanner(page);
    await expect(card).toHaveCount(1);
    await expect(card.locator("img.riso-planner-card-photo")).toHaveAttribute("src", green);
    await expect(card.locator(".riso-planner-card-name")).toHaveText("Lasagna");
  });

  test("with no photo the card shows the striped placeholder", async ({ page }) => {
    await signUp(page);
    const tourtiere = await add(page, { name: "Tourtière", quantity: 1, unit: "box", location: "freezer", isPreparedMeal: true, expiresAt: quebecDayIn(60) });
    await plan(page, tourtiere, { note: "Prepared meal · Tourtière" });
    await openPlanner(page);
    const card = page.locator(".riso-planner-cell .riso-planner-card.linked.prepared");
    await expect(card.locator(".riso-planner-card-photo.placeholder")).toBeVisible();
    await expect(card.locator(".prepared-tag")).toBeVisible();
  });

  test("leftovers typed by hand: a photo makes a card with the yellow border and the « leftover » sticker; with none it stays a note", async ({ page }) => {
    await signUp(page);
    const red = await upload(page, PNG_RED);
    const tacos = await add(page, { name: "Tacos", quantity: 2, unit: "portion", location: "fridge", isLeftover: true, imageUrl: red, expiresAt: quebecDayIn(3) });
    const chili = await add(page, { name: "Chili", quantity: 2, unit: "portion", location: "fridge", isLeftover: true, expiresAt: quebecDayIn(3) });
    await plan(page, tacos, { note: "Leftovers · Tacos", mealType: "dinner" });
    await plan(page, chili, { note: "Leftovers · Chili", mealType: "lunch" });
    await openPlanner(page);

    const card = page.locator(".riso-planner-cell .riso-planner-card.linked.leftover");
    await expect(card).toHaveCount(1);
    await expect(card.locator("img.riso-planner-card-photo")).toHaveAttribute("src", red);
    await expect(card.locator(".riso-planner-card-name")).toHaveText("Tacos");
    await expect(card.locator(".riso-planner-card-leftover")).toHaveText("leftover");
    expect(await card.evaluate((e) => [getComputedStyle(e).borderTopWidth, getComputedStyle(e).borderTopColor])).toEqual(["3px", "rgb(255, 225, 77)"]);
    await expect(card.locator(".prepared-tag")).toHaveCount(0);
    // The one with no photo is still the note.
    await expect(page.locator(".riso-planner-note", { hasText: "Leftovers · Chili" })).toHaveCount(1);
  });

  test("the calendar's day preview and Home's week strip show the photo and the tag", async ({ page }) => {
    await signUp(page);
    const red = await upload(page, PNG_RED);
    const pierogi = await add(page, { name: "Pierogi", quantity: 1, unit: "bag", location: "freezer", isPreparedMeal: true, imageUrl: red, expiresAt: quebecDayIn(60) });
    await plan(page, pierogi, { note: "Prepared meal · Pierogi" });

    // Home's week strip: today's supper is a photo card.
    await page.reload();
    const strip = page.locator(".riso-home-week-day.linked.prepared");
    await expect(strip).toHaveCount(1);
    await expect(strip.locator("img.riso-home-week-day-photo")).toHaveAttribute("src", red);
    await expect(strip.locator(".riso-home-week-day-title")).toHaveText("Pierogi");
    await expect(strip.locator(".prepared-tag.sticker")).toHaveText("prepared meal");

    // The calendar's preview of today.
    await page.getByRole("button", { name: "Planner", exact: true }).first().click();
    await page.locator(".phd-date").click();
    const calendar = page.getByRole("dialog", { name: "Choose a week" });
    await calendar.locator(".wcal-day.today").hover();
    const preview = calendar.locator(".wcal-preview.beside");
    await expect(preview).toContainText("Pierogi");
    await expect(preview.locator(".wcal-photo.prepared img")).toHaveAttribute("src", red);
    await expect(preview.locator(".prepared-tag.sticker")).toHaveText("prepared meal");
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const [french, tagText, amount] of [
    [true, "plat préparé", /4 portions/i],
    [false, "prepared meal", /4 portions/i],
  ]) {
    test(`the 104px card holds the whole tag and the amount, in ${french ? "French" : "English"}, with no sideways scroll`, async ({ page }) => {
      await signUp(page, { french });
      const red = await upload(page, PNG_RED);
      const name = french ? "Lasagne à la viande surgelée" : "Frozen meat lasagna with a very long name";
      const lasagne = await add(page, { name, quantity: 4, unit: "portion", location: "freezer", isPreparedMeal: true, imageUrl: red, expiresAt: quebecDayIn(60) });
      await plan(page, lasagne, { note: `${french ? "Plat préparé" : "Prepared meal"} · ${name}` });
      await openPlanner(page);

      const card = page.locator(".pmb-cell .riso-planner-card.linked.prepared");
      await expect(card).toHaveCount(1);
      const cardBox = await box(card);
      expect([Math.round(cardBox.width), Math.round(cardBox.height)]).toEqual([104, 104]);
      const tag = card.locator(".prepared-tag");
      await expect(tag).toHaveText(tagText);
      // The whole word and its glyph, inside the card, not cut: S is about 75px in French, 85px in English.
      expect(await tag.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
      const tagBox = await box(tag);
      expect(inside(tagBox, cardBox)).toBe(true);
      expect(tagBox.width).toBeLessThanOrEqual(french ? 82 : 92);
      // Across the photo's bottom edge: the card's photo is 50px.
      const wellBox = await box(card.locator(".riso-planner-card-photo-wrap"));
      expect(tagBox.y).toBeLessThan(wellBox.y + wellBox.height);
      expect(tagBox.y + tagBox.height).toBeGreaterThan(wellBox.y + wellBox.height - 1);
      // The amount, as "4 PORTIONS", and the name in at most two lines.
      await expect(card.locator(".riso-planner-card-time")).toHaveText(amount);
      expect(await card.locator(".riso-planner-card-time").evaluate((e) => getComputedStyle(e).textTransform)).toBe("uppercase");
      const nameBox = await box(card.locator(".riso-planner-card-name"));
      expect(nameBox.height).toBeLessThanOrEqual(30); // two lines of 12px type at most
      expect(inside(await box(card.locator(".riso-planner-card-time")), cardBox)).toBe(true);
      // The same tag on the Inventory tile (three across on a phone), inside the tile's white well in both languages.
      await page.getByRole("button", { name: /^(Inventory|Inventaire)$/ }).first().click();
      const tile = page.locator(".inv-tile", { hasText: name.slice(0, 12) });
      const tileTag = tile.locator(".prepared-tag.sticker");
      await expect(tileTag).toHaveText(tagText);
      const tileBox = await box(tile.locator(".inv-tile-well"));
      const tileTagBox = await box(tileTag);
      expect(inside(tileTagBox, tileBox, 1)).toBe(true);
      expect(tileTagBox.y + tileTagBox.height).toBeGreaterThan(tileBox.y + tileBox.height - 14); // bottom left of the well
      expect(tileTagBox.x).toBeLessThan(tileBox.x + 12);
      await openPlanner(page);
      // Nothing in the card is wider than the card, and the page does not scroll sideways.
      expect(await card.evaluate((e) => [...e.querySelectorAll("*")].filter((c) => c.getBoundingClientRect().right > e.getBoundingClientRect().right + 1).length)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }
});
