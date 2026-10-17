import { expect, test } from "@playwright/test";
import { E2E_INVITE } from "./invite.js";

// One way to move a whole section: a shelf on Inventory moves like a store on
// Grocery (components/ReorderSections.jsx). The ⠿ lifts the section itself, the
// others slide to make room (to where the grid will put them, shelves of different
// widths included), and it lands where it is let go and is saved. An item carried
// over a shelf does not slide the shelves.

async function signUp(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', `reorder+${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.fill('input[type="password"]', "testpass123");
  await page.fill('input[name="invite"]', E2E_INVITE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".tab.active")).toBeVisible();
}

async function openInventory(page) {
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(page.locator(".inv-shelf").first()).toBeVisible();
}

const order = (page) => page.locator(".inv-shelf").evaluateAll((els) => els.map((e) => e.dataset.sectionId));
const shelf = (page, id) => page.locator(`.inv-shelf[data-section-id="${id}"]`);
const gripOf = (page, name) => page.getByRole("button", { name: `Move the "${name}" section` });
const middle = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const near = (a, b, px = 2) => Math.abs(a - b) <= px;

// The shelves' sizes, in columns of the 12-column grid (what "Third" and "Half" save).
async function setSizes(page, sizes) {
  const sections = ["fridge", "freezer", "pantry", "leftovers"].map((sectionId) => ({ sectionId, size: `c12:${sizes[sectionId]}`, height: null }));
  const res = await page.request.put("/api/inventory-layout", { data: { sections } });
  expect(res.ok()).toBe(true);
}

// Where every shelf is, as the page draws it right now (a transform included).
const boxes = async (page) => {
  const out = {};
  for (const id of await order(page)) out[id] = await shelf(page, id).boundingBox();
  return out;
};

// Carry a grip with the mouse to a point, step by step; leaves the button down.
async function carry(page, grip, to) {
  const g = await grip.boundingBox();
  await page.mouse.move(middle(g).x, middle(g).y);
  await page.mouse.down();
  await page.mouse.move(middle(g).x + 8, middle(g).y - 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 14 });
  // The others slide over a fifth of a second.
  await page.waitForTimeout(450);
}

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("a shelf lifts, the others make room where they will really be, and it lands and is saved", async ({ page }) => {
    await signUp(page);
    await openInventory(page);
    await expect.poll(() => order(page)).toEqual(["fridge", "freezer", "pantry", "leftovers"]);

    // Pantry (a full row) is carried up onto the Fridge (a half).
    const fridge = await shelf(page, "fridge").boundingBox();
    await carry(page, gripOf(page, "Pantry"), { x: fridge.x + 40, y: fridge.y + 40 });

    // The shelf itself is lifted (no copy), and nothing shows the "item dropped here" look.
    await expect(page.locator(".reorder-lifted")).toHaveCount(1);
    await expect(shelf(page, "pantry")).toHaveClass(/reorder-lifted/);
    await expect(page.locator(".inv-shelf.drop-active")).toHaveCount(0);
    // Fridge and Freezer have slid down a row to make room, side by side as before.
    const during = await boxes(page);
    expect(during.fridge.y).toBeGreaterThan(fridge.y + 100);
    expect(near(during.fridge.y, during.freezer.y)).toBe(true);
    expect(during.fridge.x).toBeLessThan(during.freezer.x);

    await page.mouse.up();
    await expect.poll(() => order(page)).toEqual(["pantry", "fridge", "freezer", "leftovers"]);
    // What they showed while Pantry was carried is where they are now.
    const after = await boxes(page);
    for (const id of ["fridge", "freezer"]) {
      expect(near(after[id].x, during[id].x)).toBe(true);
      expect(near(after[id].y, during[id].y)).toBe(true);
      expect(near(after[id].width, during[id].width)).toBe(true);
    }
    await expect(page.locator(".reorder-lifted")).toHaveCount(0);

    // Saved: still so after a reload.
    await openInventory(page);
    await expect.poll(() => order(page)).toEqual(["pantry", "fridge", "freezer", "leftovers"]);
  });

  test("shelves of different widths slide to where the grid puts them, none stretched", async ({ page }) => {
    await signUp(page);
    // Three Thirds on the first row, a Half under them.
    await setSizes(page, { fridge: 4, freezer: 4, pantry: 4, leftovers: 6 });
    await openInventory(page);
    const before = await boxes(page);
    expect(near(before.fridge.y, before.pantry.y)).toBe(true);
    expect(before.leftovers.y).toBeGreaterThan(before.fridge.y + 100);

    // The Half is carried onto the first Third: Half + Third fill the row, the next Third wraps.
    await carry(page, gripOf(page, "Leftovers"), middle(before.fridge));
    const during = await boxes(page);
    for (const id of ["fridge", "freezer", "pantry"]) expect(near(during[id].width, before[id].width)).toBe(true);
    expect(near(during.fridge.y, before.fridge.y)).toBe(true);
    expect(during.fridge.x).toBeGreaterThan(before.fridge.x + 200); // beside the Half, not under it
    expect(during.freezer.y).toBeGreaterThan(before.fridge.y + 100); // wrapped to the next row

    await page.mouse.up();
    await expect.poll(() => order(page)).toEqual(["leftovers", "fridge", "freezer", "pantry"]);
    const after = await boxes(page);
    for (const id of ["fridge", "freezer", "pantry"]) {
      expect(near(after[id].x, during[id].x)).toBe(true);
      expect(near(after[id].y, during[id].y)).toBe(true);
      expect(near(after[id].width, before[id].width)).toBe(true);
    }
    // The widths were saved as they were.
    await openInventory(page);
    const reloaded = await boxes(page);
    for (const id of ["fridge", "freezer", "pantry", "leftovers"]) expect(near(reloaded[id].width, before[id].width)).toBe(true);
  });

  test("an item carried over a shelf does not slide the shelves, and still drops on it", async ({ page }) => {
    await signUp(page);
    await page.request.post("/api/pantry-inventory", { data: { location: "fridge", name: "Crevettes", quantity: 1, unit: "lb" } });
    await openInventory(page);
    const item = page.locator(":is(.inv-row, .inv-tile)", { hasText: "Crevettes" });
    const freezer = await shelf(page, "freezer").boundingBox();
    const from = middle(await item.boundingBox());
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.waitForTimeout(350); // the app's still hold
    await page.mouse.move(middle(freezer).x, middle(freezer).y, { steps: 14 });
    await page.waitForTimeout(450);

    await expect(shelf(page, "freezer")).toHaveClass(/drop-active/);
    await expect(page.locator(".reorder-lifted")).toHaveCount(0);
    const transforms = await page.locator(".inv-shelf").evaluateAll((els) => els.map((e) => e.style.transform));
    for (const t of transforms) expect(t === "" || /translate3d\(0px, 0px, 0px\)/.test(t)).toBe(true);

    await page.mouse.up();
    await expect(shelf(page, "freezer").locator(":is(.inv-row, .inv-tile)", { hasText: "Crevettes" })).toBeVisible();
    await expect.poll(async () => (await (await page.request.get("/api/pantry-inventory")).json()).find((i) => i.name === "Crevettes").location).toBe("freezer");
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  async function touch(client, type, points) {
    await client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  }
  const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  test("a finger on the ⠿ carries the shelf with no hold, the page does not scroll, the others make room, and it is saved", async ({ page, context }) => {
    await signUp(page);
    await openInventory(page);
    const client = await context.newCDPSession(page);
    await expect.poll(() => order(page)).toEqual(["fridge", "freezer", "pantry", "leftovers"]);

    // Freezer's grip, then straight up onto the Fridge (a finger that does not hold still first).
    const grip = middle(await gripOf(page, "Freezer").boundingBox());
    const fridge = await shelf(page, "fridge").boundingBox();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await touch(client, "touchStart", [grip]);
    const steps = 14;
    const target = { x: grip.x, y: fridge.y + 20 };
    for (let i = 1; i <= steps; i++) {
      await touch(client, "touchMove", [{ x: grip.x + ((target.x - grip.x) * i) / steps, y: grip.y + ((target.y - grip.y) * i) / steps }]);
      await frame(page);
    }
    await page.waitForTimeout(450);

    await expect(shelf(page, "freezer")).toHaveClass(/reorder-lifted/);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore); // the page stayed still under the finger
    const lifted = await shelf(page, "freezer").boundingBox();
    expect(Math.abs(lifted.y - (target.y - 14))).toBeLessThan(60); // it follows the finger
    const slid = await shelf(page, "fridge").evaluate((el) => el.style.transform);
    expect(slid).toMatch(/translate3d\(0px, [1-9]/); // the Fridge moved down to make room
    await page.screenshot({ path: test.info().outputPath("shelf-carried-on-phone.png") });

    await touch(client, "touchEnd", []);
    await expect.poll(() => order(page)).toEqual(["freezer", "fridge", "pantry", "leftovers"]);
    await page.screenshot({ path: test.info().outputPath("shelf-dropped-on-phone.png") });
    await openInventory(page);
    await expect.poll(() => order(page)).toEqual(["freezer", "fridge", "pantry", "leftovers"]);
  });
});

test.describe("Grocery's stores, the same piece", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("a store lifts, the other slides to make room, and the order is saved", async ({ page }) => {
    await signUp(page);
    const recipe = await (
      await page.request.post("/api/recipes", {
        data: { title: "Garlic lemon pasta", baseServings: 2, ingredients: [{ name: "garlic", quantity: 4, unit: "clove" }] },
      })
    ).json();
    const x = new Date();
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + 7);
    const monday = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    await page.request.post("/api/planner", { data: { recipeId: recipe.id, weekStart: monday, dayOfWeek: 0, mealType: "dinner" } });
    await page.reload();
    await page.getByRole("button", { name: "Grocery", exact: true }).click();
    for (const name of ["Costco", "Adonis"]) {
      await page.getByRole("button", { name: "+ Add store" }).click();
      await page.getByLabel("Store name").fill(name);
      await page.getByRole("button", { name: "Add", exact: true }).last().click();
      await expect(page.getByRole("region", { name: `${name} store` })).toBeVisible();
    }
    const names = () => page.locator(".riso-group .riso-group-name").allInnerTexts();

    const grip = await page.getByLabel("Reorder the Adonis store").boundingBox();
    const costco = await page.getByRole("region", { name: "Costco store" }).boundingBox();
    await page.mouse.move(middle(grip).x, middle(grip).y);
    await page.mouse.down();
    await page.mouse.move(grip.x + 10, grip.y - 10, { steps: 4 });
    await page.mouse.move(costco.x + 60, costco.y + 20, { steps: 12 });
    await page.waitForTimeout(450);
    await expect(page.getByRole("region", { name: "Adonis store" })).toHaveClass(/reorder-lifted/);
    await expect(page.getByRole("region", { name: "Costco store" })).toHaveAttribute("style", /translate3d\(0px, [1-9]/);
    await page.mouse.up();
    await expect.poll(async () => {
      const after = await names();
      return after.indexOf("Adonis") < after.indexOf("Costco");
    }).toBe(true);
    await page.reload();
    await page.getByRole("button", { name: "Grocery", exact: true }).click();
    await expect.poll(async () => {
      const after = await names();
      return after.indexOf("Adonis") < after.indexOf("Costco");
    }).toBe(true);
  });
});
