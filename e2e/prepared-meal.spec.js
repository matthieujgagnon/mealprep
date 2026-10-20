import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";
import { addDays, quebecDay, quebecDayIn } from "./quebec-day.js";
import { itemForm, pickCompact } from "./inventory-form.js";

// Prepared meals: a ready-made dish in Inventory (a frozen lasagna, Matt's "Chicken,
// Broccoli and Cheddar Puff Pastry") is a meal, not an ingredient. Tagged with the
// Prepared meal switch, it never counts as chicken in any recipe, and it is planned
// and eaten like leftovers (lib/mealItem.js is the one rule).

const PASTRY = "Chicken, Broccoli and Cheddar Puff Pastry";
const STIR_FRY = { title: "Chicken broccoli stir-fry", mealSlot: "dinner", instructions: ["Cook it."], ingredients: [{ name: "chicken breast" }, { name: "broccoli" }, { name: "cheddar cheese" }] };

async function signUp(page, { french = false } = {}) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `prepared+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toHaveText("Home");
  if (french) {
    await page.request.patch("/api/auth/me", { data: { locale: "fr" } });
    await page.reload();
  }
}

const add = async (page, data) => (await page.request.post("/api/pantry-inventory", { data })).json();
const inventory = async (page) => (await page.request.get("/api/pantry-inventory")).json();
const tab = (page, name) => page.getByRole("button", { name, exact: true }).first();
const prepared = (page) => itemForm(page).getByRole("switch", { name: "Prepared meal" });

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
const todayIndex = () => (new Date().getDay() + 6) % 7;

test.describe("on a computer, in English", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("tagging the pastry as a prepared meal: the recipe's chicken stops being blue, and it can be planned", async ({ page }) => {
    await signUp(page);
    await page.request.post("/api/recipes", { data: STIR_FRY });
    await add(page, { name: PASTRY, quantity: 2, unit: "box", location: "freezer", expiresAt: quebecDayIn(30) });
    await page.reload();

    // Untagged, it is chicken: the stir-fry has one of three in Inventory.
    await tab(page, "Makeable").click();
    let card = page.locator(".mkc", { has: page.locator(".rpc-title", { hasText: STIR_FRY.title }) });
    await expect(card.locator(".mkc-progress span")).toHaveText(["1/3 ingredients", "2 missing"]);
    await card.locator(".rpc-title").click();
    const recipeCard = page.getByRole("dialog", { name: STIR_FRY.title });
    await expect(recipeCard.locator(".riso-rc-have")).toHaveCount(1);
    await expect(recipeCard.locator(".riso-rc-have")).toContainText(/chicken/i);
    await page.keyboard.press("Escape");

    // Inventory: the pop-up of an ordinary item says how many recipes use it.
    await tab(page, "Inventory").click();
    const tile = page.locator(".inv-tile", { hasText: PASTRY });
    await expect(tile.locator(".prepared-tag")).toHaveCount(0);
    await tile.click();
    await expect(itemForm(page)).toBeVisible();
    await expect(itemForm(page).locator(".riso-itemform-recipes")).toContainText(`recipes use ${PASTRY}`);
    await expect(prepared(page)).toHaveAttribute("aria-checked", "false");

    // Switch on Prepared meal and save.
    await prepared(page).click();
    await expect(itemForm(page).locator(".riso-itemform-recipes")).toContainText("A meal, not an ingredient");
    await itemForm(page).getByRole("button", { name: "Save changes" }).click();
    await expect(itemForm(page)).toHaveCount(0);
    expect((await inventory(page)).find((i) => i.name === PASTRY)).toMatchObject({ isPreparedMeal: true, isLeftover: false });

    // The shared tag, in plain ink (no yellow, blue or green), as a sticker on the tile's photo and
    // upright on the compact row.
    await expect(tile.locator(".prepared-tag.sticker")).toHaveText("prepared meal");
    const tagColours = await tile.locator(".prepared-tag").evaluate((e) => {
      const css = getComputedStyle(e);
      return { bg: css.backgroundColor, fg: css.color };
    });
    expect(tagColours).toEqual({ bg: "rgb(22, 24, 31)", fg: "rgb(255, 253, 248)" });
    await pickCompact(page);
    const rowTag = page.locator(".inv-row", { hasText: PASTRY }).locator(".prepared-tag");
    await expect(rowTag).toHaveText("prepared meal");
    await expect(rowTag).not.toHaveClass(/sticker/);

    // The pop-up now offers Plan it instead of a recipe count.
    await page.locator(".inv-row", { hasText: PASTRY }).click();
    await expect(itemForm(page).locator(".riso-itemform-recipes")).toContainText("A meal, not an ingredient");
    await expect(itemForm(page).locator(".riso-itemform-recipes").getByRole("button", { name: "Plan it" })).toBeVisible();
    await expect(itemForm(page).locator(".riso-itemform-recipes").getByRole("button", { name: /see them/i })).toHaveCount(0);
    await itemForm(page).getByRole("button", { name: "Cancel" }).click();

    // The same recipe, next to the same Inventory: nothing is had from the pastry any more.
    await tab(page, "Makeable").click();
    card = page.locator(".mkc", { has: page.locator(".rpc-title", { hasText: STIR_FRY.title }) });
    await expect(card.locator(".mkc-progress span")).toHaveText(["0/3 ingredients", "3 missing"]);
    await card.locator(".rpc-title").click();
    await expect(page.getByRole("dialog", { name: STIR_FRY.title }).locator(".riso-rc-have")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: STIR_FRY.title }).locator(".riso-rc-buy")).toHaveCount(3);
    await page.keyboard.press("Escape");

    // Switch it off again: it is chicken once more, and nothing else changed.
    await tab(page, "Inventory").click();
    await page.locator(".inv-row", { hasText: PASTRY }).click();
    await prepared(page).click();
    await itemForm(page).getByRole("button", { name: "Save changes" }).click();
    await expect.poll(async () => (await inventory(page)).find((i) => i.name === PASTRY).isPreparedMeal).toBe(false);
  });

  test("Add item: a name that looks like a ready meal starts the switch on, and it can be switched off", async ({ page }) => {
    await signUp(page);
    await tab(page, "Inventory").click();
    await page.getByRole("button", { name: "+ Add item" }).click();
    const form = itemForm(page);
    await expect(prepared(page)).toHaveAttribute("aria-checked", "false");

    await form.getByLabel("Item name").fill("Frozen lasagna");
    await expect(prepared(page)).toHaveAttribute("aria-checked", "true");
    await expect(form.locator(".riso-itemform-prepared-hint")).toHaveText("Looks like a ready meal");
    // The switch's label is the tag itself, and the preview's photo wears it as a sticker.
    await expect(form.locator(".riso-itemform-prepared-label .prepared-tag")).toHaveText("prepared meal");
    await expect(form.locator(".riso-itemform-card .prepared-tag.sticker")).toHaveText("prepared meal");

    // Switched off by hand: the name stays as a plain food, and typing more does not turn it back on.
    await prepared(page).click();
    await expect(prepared(page)).toHaveAttribute("aria-checked", "false");
    await expect(form.locator(".riso-itemform-prepared-hint")).toHaveCount(0);
    await form.getByLabel("Item name").fill("Frozen lasagna sheets");
    await expect(prepared(page)).toHaveAttribute("aria-checked", "false");
    await form.getByRole("button", { name: "Add and next" }).click();
    await expect(form.locator(".riso-itemform-tray-row")).toHaveCount(1);

    // The next item starts fresh: perogies look like a ready meal too.
    await form.getByLabel("Item name").fill("Cheddar perogies");
    await expect(prepared(page)).toHaveAttribute("aria-checked", "true");
    await form.getByRole("button", { name: "Add and next" }).click();
    await expect(form.locator(".riso-itemform-tray-row")).toHaveCount(2);

    // A plain food and a food to cook with are not suggested.
    await form.getByLabel("Item name").fill("Pizza dough");
    await expect(prepared(page)).toHaveAttribute("aria-checked", "false");
    await form.getByLabel("Item name").fill("Chicken breast");
    await expect(prepared(page)).toHaveAttribute("aria-checked", "false");
    await expect(form.locator(".riso-itemform-prepared-hint")).toHaveCount(0);
    // Switched on by hand there is no "looks like" line: it was not a guess.
    await prepared(page).click();
    await expect(form.locator(".riso-itemform-prepared-hint")).toHaveCount(0);
    await prepared(page).click();
    await form.getByRole("button", { name: "Add to inventory" }).click();

    const items = await inventory(page);
    const byName = (name) => items.find((i) => i.name === name);
    expect(byName("Frozen lasagna sheets").isPreparedMeal).toBe(false);
    expect(byName("Cheddar perogies").isPreparedMeal).toBe(true);
    expect(byName("Chicken breast").isPreparedMeal).toBe(false);

    // In Leftovers mode there is no switch: leftovers are already meals.
    await page.getByRole("button", { name: "+ Add item" }).click();
    await itemForm(page).getByRole("button", { name: "Leftovers", exact: true }).click();
    await expect(itemForm(page).getByRole("switch", { name: "Prepared meal" })).toHaveCount(0);
  });

  test("existing items are never tagged for you, whatever their name", async ({ page }) => {
    await signUp(page);
    await add(page, { name: "Lasagna", quantity: 1, unit: "box", location: "freezer" });
    await page.reload();
    await tab(page, "Inventory").click();
    await page.locator(".inv-tile", { hasText: "Lasagna" }).click();
    await expect(prepared(page)).toHaveAttribute("aria-checked", "false");
    await expect(itemForm(page).locator(".riso-itemform-prepared-hint")).toHaveCount(0);
    expect((await inventory(page))[0].isPreparedMeal).toBe(false);
  });

  test("plan the prepared meal from the Planner search, and when its day has passed one box comes off, with Undo", async ({ page }) => {
    await signUp(page);
    await page.request.post("/api/recipes", { data: STIR_FRY });
    const lasagna = await add(page, { name: "Lasagna", quantity: 2, unit: "box", location: "freezer", isPreparedMeal: true, expiresAt: quebecDayIn(60) });
    const chili = await add(page, { name: "Chili", quantity: 1, unit: "portion", location: "fridge", isLeftover: true, expiresAt: quebecDayIn(3) });
    await add(page, { name: "Chicken breasts", quantity: 1, unit: "kg", location: "fridge" });
    await page.reload();

    // It is offered with the leftovers, as a plain card; chicken is not.
    await tab(page, "Planner").click();
    await page.getByRole("button", { name: "Browse" }).click();
    await expect(page.locator(".fnd-card.leftover")).toHaveCount(2);
    const search = page.locator(".fnd-card.leftover", { hasText: "Prepared meal · Lasagna · 2 boxes" });
    await expect(search.locator(".rpc-tag .prepared-tag.sticker")).toHaveText("prepared meal");
    await expect(search).toContainText("Nothing to buy");
    await search.locator(".rpc-add").click();
    await page.locator(".riso-picker").getByRole("button", { name: /^Add to / }).click();
    await expect(page.locator(".riso-toast")).toContainText("Prepared meal Lasagna added to");

    // On the board it has no recipe, so it is held as a note, like leftovers typed in by hand, but it is
    // drawn as a photo card: the 3px ink border and the shared « prepared meal » tag.
    const today = quebecDay(Date.now());
    const upcoming = async () => (await (await page.request.get(`/api/planner/upcoming?from=${today}`)).json()).find((e) => e.isLeftover);
    expect(await upcoming()).toMatchObject({ leftoverItemId: lasagna.id });
    expect((await upcoming()).recipe.title).toBe("Prepared meal · Lasagna");
    const note = page.locator(".riso-planner-card.linked.prepared");
    await expect(note.locator(".prepared-tag.sticker")).toHaveText("prepared meal");
    await expect(note.locator(".riso-planner-card-name")).toHaveText("Lasagna");
    // The border is 3px of ink (a leftover's is yellow), and the tag is the same ink.
    expect(await note.evaluate((e) => [getComputedStyle(e).borderTopWidth, getComputedStyle(e).borderTopColor])).toEqual(["3px", "rgb(22, 24, 31)"]);
    // The legend names it with the same tag.
    await expect(page.locator(".plg .prepared-tag")).toHaveText("prepared meal");
    expect(chili.id).toBeTruthy();

    // Removing the note and pressing Undo brings it back still eating from the lasagna.
    await note.click();
    await page.getByRole("button", { name: "Remove note" }).click();
    await expect(page.locator(".riso-planner-card.linked.prepared")).toHaveCount(0);
    await page.locator(".riso-toast").getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".riso-planner-card.linked.prepared")).toHaveCount(1);
    await expect.poll(async () => (await upcoming())?.leftoverItemId).toBe(lasagna.id);

    // A day goes by (the browser's clock is two days on): one box comes off, once.
    const later = new Date(Date.now() + 2 * 86400000);
    await page.clock.setFixedTime(later);
    await page.reload();
    await expect(page.locator(".riso-toast")).toContainText("1 meal taken off your Inventory: Prepared meal · Lasagna");
    const boxes = async () => (await inventory(page)).find((i) => i.id === lasagna.id)?.quantity;
    expect(await boxes()).toBe(1);
    await page.locator(".riso-toast").getByRole("button", { name: "Undo" }).click();
    await expect.poll(boxes).toBe(2);
    // Counted once: coming back does not take it again.
    await page.reload();
    await expect(page.locator(".tab.active")).toHaveText("Home");
    expect(await boxes()).toBe(2);
  });

  test("a prepared meal counted by weight comes off whole, lands in Recently removed, and Put back keeps the tag", async ({ page }) => {
    await signUp(page);
    const perogies = await add(page, { name: "Perogies", quantity: 900, unit: "g", location: "freezer", isPreparedMeal: true, expiresAt: quebecDayIn(60) });
    const lastWeek = mondayOf(new Date(Date.now() - 7 * 86400000));
    const note = await (await page.request.post("/api/planner/blank", { data: { weekStart: lastWeek, dayOfWeek: 6, mealType: "dinner", note: "Prepared meal · Perogies" } })).json();
    const linked = await page.request.put(`/api/planner/${note.id}`, { data: { isLeftover: true, leftoverItemId: perogies.id } });
    expect(linked.ok()).toBe(true);

    await page.reload();
    await expect(page.locator(".riso-toast")).toContainText("1 meal taken off your Inventory: Prepared meal · Perogies");
    expect((await inventory(page)).find((i) => i.id === perogies.id)).toBeUndefined();

    // Recently removed holds it as it was, tag included; Put back brings it back tagged.
    await tab(page, "Inventory").click();
    const strip = page.locator(".riso-removed", { hasText: "Recently removed" });
    await strip.getByRole("button", { name: /Recently removed/ }).click();
    await expect(strip.locator(".riso-removed-name")).toHaveText("Perogies");
    await strip.locator(".riso-removed-putback").click();
    await expect.poll(async () => (await inventory(page)).find((i) => i.id === perogies.id)).toMatchObject({ isPreparedMeal: true, quantity: 900, unit: "g" });
  });

  test("the server refuses to link a planned meal to an ingredient, and keeps the two flags apart", async ({ page }) => {
    await signUp(page);
    const chicken = await add(page, { name: "Chicken breasts", quantity: 1, unit: "kg", location: "fridge" });
    const recipe = await (await page.request.post("/api/recipes", { data: STIR_FRY })).json();
    const place = (leftoverItemId) =>
      page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: mondayOf(new Date()), dayOfWeek: 0, mealType: "dinner", isLeftover: true, leftoverItemId } });
    const refused = await place(chicken.id);
    expect(refused.status()).toBe(400);
    expect((await refused.json()).error).toBeTruthy();
    // An item that is gone (Undo puts it back with the same id) is fine.
    expect((await place("gone-item")).status()).toBe(201);

    // A leftover is already a meal: it is never also a prepared meal, and the suggestion is a hint only.
    const both = await add(page, { name: "Pizza", quantity: 1, unit: "portion", location: "fridge", isLeftover: true, isPreparedMeal: true });
    expect(both).toMatchObject({ isLeftover: true, isPreparedMeal: false });
    const flipped = await (await page.request.put(`/api/pantry-inventory/${chicken.id}`, { data: { isPreparedMeal: true } })).json();
    expect(flipped.isPreparedMeal).toBe(true);
    const toLeftover = await (await page.request.put(`/api/pantry-inventory/${chicken.id}`, { data: { isLeftover: true } })).json();
    expect(toLeftover).toMatchObject({ isLeftover: true, isPreparedMeal: false });
    const suggest = async (name) => (await (await page.request.get(`/api/pantry-inventory/suggest?name=${encodeURIComponent(name)}`)).json()).readyMeal;
    expect(await suggest("Pierogi")).toBe(true);
    expect(await suggest("Tourtière")).toBe(true);
    expect(await suggest("Pâté chinois")).toBe(true);
    expect(await suggest("Pâtes")).toBe(false);
    expect(await suggest(PASTRY)).toBe(false);
  });
});

test.describe("on a phone, in French", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // The Add item form, an Inventory tile and row with the tag, and a planned prepared
  // meal on the phone board all fit: nothing wider than the screen.
  test("the switch, its line, the tag and the planned card fit, with no sideways scroll", async ({ page }) => {
    await signUp(page, { french: true });
    // The Planner shows its board once there is a recipe.
    await page.request.post("/api/recipes", { data: STIR_FRY });
    const lasagne = await add(page, { name: "Lasagne à la viande surgelée", quantity: 2, unit: "box", location: "freezer", isPreparedMeal: true, expiresAt: quebecDayIn(40) });
    await add(page, { name: "Poitrines de poulet", quantity: 1, unit: "kg", location: "fridge" });
    const note = await (await page.request.post("/api/planner/blank", { data: { weekStart: mondayOf(new Date()), dayOfWeek: todayIndex(), mealType: "dinner", note: "Plat préparé · Lasagne à la viande surgelée" } })).json();
    await page.request.put(`/api/planner/${note.id}`, { data: { isLeftover: true, leftoverItemId: lasagne.id } });
    await page.reload();

    const noSideways = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    };
    const cramped = (selector) =>
      page.locator(selector).evaluateAll((els) =>
        els
          .filter((e) => e.offsetParent && (e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > window.innerWidth + 1 || e.getBoundingClientRect().left < -1))
          .map((e) => e.textContent.trim())
      );

    // Inventory: the tag on the tile and on the compact row.
    await tab(page, "Inventaire").click();
    await expect(page.locator(".inv-tile", { hasText: "Lasagne" }).locator(".prepared-tag")).toHaveText("plat préparé");
    expect(await cramped(".inv-tile .prepared-tag")).toEqual([]);
    await noSideways();
    await pickCompact(page);
    await expect(page.locator(".inv-row", { hasText: "Lasagne" }).locator(".prepared-tag")).toHaveText("plat préparé");
    expect(await cramped(".inv-row .prepared-tag")).toEqual([]);
    await noSideways();

    // The pop-up of the prepared meal: the line and Planifier fit.
    await page.locator(".inv-row", { hasText: "Lasagne" }).click();
    await expect(itemForm(page).getByRole("switch", { name: "Plat préparé" })).toHaveAttribute("aria-checked", "true");
    await expect(itemForm(page).locator(".riso-itemform-recipes")).toContainText("Un plat, pas un ingrédient");
    await expect(itemForm(page).locator(".riso-itemform-recipes").getByRole("button", { name: "Planifier" })).toBeVisible();
    expect(await cramped(".riso-itemform .riso-itemform-prepared *, .riso-itemform .riso-itemform-recipes, .riso-itemform .riso-itemform-recipes *")).toEqual([]);
    await noSideways();
    await itemForm(page).getByRole("button", { name: "Annuler" }).click();

    // Add item, with a name that looks like a ready meal: the switch starts on with its French line.
    await page.getByRole("button", { name: "+ Ajouter un article" }).click();
    await itemForm(page).getByLabel("Nom de l'article").fill("Tourtière du Lac-Saint-Jean");
    const sw = itemForm(page).getByRole("switch", { name: "Plat préparé" });
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await expect(itemForm(page).locator(".riso-itemform-prepared-hint")).toHaveText("Ça ressemble à un plat préparé");
    await expect(itemForm(page).locator(".riso-itemform-prepared-help")).toBeVisible();
    expect(await cramped(".riso-itemform .riso-itemform-prepared, .riso-itemform .riso-itemform-prepared *")).toEqual([]);
    await noSideways();
    await page.screenshot({ path: test.info().outputPath("prepared-add-phone-fr.png"), fullPage: true });
    await itemForm(page).getByRole("button", { name: "Annuler" }).click();

    // The phone board: the planned meal is a photo card and wears « plat préparé », whole, inside the 104px card.
    await tab(page, "Planificateur").click();
    const card = page.locator(".pmb-cell .riso-planner-card.linked.prepared");
    await expect(card.locator(".prepared-tag")).toHaveText("plat préparé");
    await expect(card.locator(".riso-planner-card-name")).toHaveText("Lasagne à la viande surgelée");
    expect(await cramped(".pmb-cell .riso-planner-card.linked.prepared, .pmb-cell .riso-planner-card.linked.prepared *")).toEqual([]);
    await noSideways();
    await page.screenshot({ path: test.info().outputPath("prepared-planner-phone-fr.png"), fullPage: true });
  });
});
