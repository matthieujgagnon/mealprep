import { expect, test } from "@playwright/test";

// Regression coverage for a real mobile drag-and-drop bug: every existing
// drag e2e test (grocery/recipes/inventory) simulates a drag via
// page.mouse.move()/down()/up(), which dispatches synthetic MOUSE pointer
// events. Those never touch the browser's native touch-action gesture
// arbitration - that's a touch-only code path - so no prior test could
// have caught (or can regress-guard) a touch-action bug.
//
// These tests dispatch real touch events via CDP's Input.dispatchTouchEvent,
// which goes through Chromium's actual input pipeline and therefore
// genuinely exercises touch-action, the way page.mouse and a synthetic
// `new TouchEvent()` from page.evaluate() do not.
//
// The bug this guards against: touch-action: pan-y (previously used on
// .meal-card, .inv-card, .sidebar-recipe-chip, .popup-recipe-chip,
// .grocery-item.draggable) lets the browser's native scroll claim a touch
// gesture the instant it moves in the permitted axis - independent of
// dnd-kit's own delay-based activation constraint, which only gates
// whether dnd-kit's OWN drag starts. A held-then-dragged touch (which
// satisfies dnd-kit's 200ms delay) still gets cancelled mid-drag by a
// native scroll takeover (a `pointercancel` fires) once it moves along a
// pan-y axis - which is virtually every drag on these single-column mobile
// layouts, since they only stack vertically. touch-action: none is what
// actually keeps a drag alive on real touch input.

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 700 } });

function uniqueEmail(tag) {
  return `${tag}+${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function signUp(page, email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "testpass123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
}

// Dispatches a real held-then-moved touch gesture (touchstart, a pause past
// dnd-kit's 200ms activation delay, then incremental touchmoves to the
// target) via CDP, and returns whether a pointercancel fired anywhere in
// the document during it - the signal that a native gesture (usually
// scroll) stole the touch away from the in-progress drag.
async function touchDragAndDetectCancel(page, client, from, to, { steps = 15 } = {}) {
  const canceled = await page.evaluateHandle(() => {
    const state = { canceled: false };
    document.addEventListener("pointercancel", () => { state.canceled = true; }, { capture: true });
    return state;
  });

  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from.x, y: from.y }],
  });
  await page.waitForTimeout(260); // exceed dnd-kit's 200ms activation delay, holding still
  for (let i = 1; i <= steps; i++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }],
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(200);

  return page.evaluate((s) => s.canceled, canceled);
}

test("a real (non-mouse-simulated) touch drag moves an inventory card between shelves without the browser cancelling it", async ({
  page,
  context,
}) => {
  await signUp(page, uniqueEmail("touch-inv"));
  await page.getByRole("button", { name: "Inventory", exact: true }).click();

  await page.getByRole("button", { name: "+ Add item" }).click();
  await page.fill('input[placeholder="e.g. Chicken breast"]', "Touch Drag Item");
  await page.locator(".modal-content select").nth(1).selectOption("fridge");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(150);
  await page.locator(".modal-close").click();

  const client = await context.newCDPSession(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const fridgeShelf = page.locator(".inv-shelf", { hasText: "Fridge" });
  const card = fridgeShelf.locator(".inv-card", { hasText: "Touch Drag Item" });
  const cardBox = await card.boundingBox();
  // Pantry sits below Fridge - a purely vertical drag, the exact direction
  // a pan-y touch-action would have handed to native scroll.
  const pantryShelf = page.locator(".inv-shelf", { hasText: "Pantry" });
  const pantryBox = await pantryShelf.boundingBox();

  const canceled = await touchDragAndDetectCancel(
    page,
    client,
    { x: cardBox.x + cardBox.width / 2, y: cardBox.y + cardBox.height / 2 },
    { x: pantryBox.x + pantryBox.width / 2, y: pantryBox.y + pantryBox.height / 2 }
  );

  // The point of this test is that a held-then-moved vertical touch drag
  // survives at all (isn't cancelled by native scroll partway through),
  // not exact drop precision - that's already covered by the mouse-based
  // drag test in inventory-redesign.spec.js. A pointercancel here means
  // the browser silently handed the gesture to native scroll instead of
  // dnd-kit, which is exactly the bug class this test exists to catch.
  expect(canceled).toBe(false);
});

// The Recipes tab itself lost drag-and-drop when it moved to the Riso
// unified grid (filter chips + sort replaced manual reordering), so this
// now exercises the other still-draggable single-column-mobile recipe
// grid: dragging a card from the Planner tab's own "drag a recipe from
// your cookbook" picker onto a planner cell.
test("a real touch drag places a recipe from the Planner's picker grid onto a planner cell without the browser cancelling it", async ({
  page,
  context,
}) => {
  await signUp(page, uniqueEmail("touch-recipe"));

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "+ New recipe" }).click();
  await page.fill('input[placeholder="Grandma\'s lasagna"]', "Touch Recipe One");
  await page.fill('input[placeholder="e.g. 4"]', "2");
  await page.fill('input[placeholder="Name (e.g. butter)"]', "flour");
  await page.fill('input[placeholder="Qty (1/4)"]', "1");
  await page.fill('textarea[placeholder*="Preheat oven"]', "Cook and serve.");
  await page.getByRole("button", { name: "Save to cookbook" }).click();
  await page.waitForTimeout(250);

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.waitForTimeout(300);

  const sourceCard = page.locator(".collection-grid .meal-card", { hasText: "Touch Recipe One" });
  const targetCell = page.locator(".planner-cell").last();

  // The board (7 days x 3 meals) is taller than the 700px mobile viewport,
  // with the picker grid below it - scroll so the LAST planner cell (the
  // one closest to the picker section) and the source card land in view
  // together, since a touch coordinate outside the viewport can't hit
  // anything.
  await targetCell.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 200));

  const client = await context.newCDPSession(page);
  const sourceBox = await sourceCard.boundingBox();
  const targetBox = await targetCell.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  const canceled = await touchDragAndDetectCancel(
    page,
    client,
    { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 },
    { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 }
  );

  expect(canceled).toBe(false);
});
