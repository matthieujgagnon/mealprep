// A picture that fails (or loads late) while a finger is down on a card that is held or
// dragged. The browser loses a touch whose element leaves the page and takes it for a
// page scroll, which cancels the drag; the app keeps pictures out of the touch (the one
// `.press-hold` rule in index.css). These helpers make the failure happen at a chosen
// moment of a real touch gesture (Chromium's own input pipeline, over CDP).

// Holds the requests for the pictures that match `pattern` until `fail()` is called, then
// refuses them. The test sandbox has no internet, so without the hold a picture fails on
// its own a few hundred ms after the page opens, at a moment the test does not choose.
export async function holdPictures(page, pattern) {
  let fail;
  const gate = new Promise((resolve) => (fail = resolve));
  await page.route(pattern, async (route) => {
    await gate;
    await route.abort();
  });
  return { fail };
}

export const WHEN_FAILS = ["during the hold", "while it is carried"];

// Puts a finger on `from`, holds, moves to `to` and lifts. `pictureFails()` (it makes
// the picture fail and waits until the page shows it) runs at `when`. Returns how many
// `pointercancel`s the page saw: 0 means nothing took the touch away.
export async function holdAndDragWhilePictureFails(page, { from, to, when, pictureFails, steps = 12 }) {
  const client = await page.context().newCDPSession(page);
  const send = (type, points) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(() => {
    window.__cancels = 0;
    document.addEventListener("pointercancel", () => window.__cancels++, true);
  });

  await send("touchStart", [from]);
  await page.waitForTimeout(100);
  if (when === WHEN_FAILS[0]) await pictureFails();
  await page.waitForTimeout(250); // past the app's 200 ms hold
  for (let i = 1; i <= steps; i++) {
    await send("touchMove", [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]);
    await frame();
    if (i === 4 && when === WHEN_FAILS[1]) await pictureFails();
  }
  await send("touchEnd", []);
  await page.waitForTimeout(300);
  return page.evaluate(() => window.__cancels);
}
