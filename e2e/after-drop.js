// Waits until a click gets through again after a drag has been dropped.
//
// The drag library (dnd-kit, core.esm.js, `detach()`) stops EVERY click on the page for 50 ms after a drag
// ends, so that letting go over a button never also presses it. A person cannot click that fast, but a test
// can: when what it waits for after the drop is already true (the card moved on screen at once, the server
// answered the first poll), its next click lands inside that 50 ms and the page never sees it. The button
// looks pressed to Playwright and does nothing.
//
// So a spec that clicks something right after a drop waits here first. It does not guess a time: it sends a
// click to a throw-away element and watches whether it arrives, and tries again every few milliseconds until
// it does (straight away when nothing was dragged).
export async function waitForClicksAfterDrop(page) {
  await page.waitForFunction(
    () => {
      const probe = document.createElement("i");
      let arrived = false;
      probe.addEventListener("click", () => {
        arrived = true;
      });
      document.body.append(probe);
      probe.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      probe.remove();
      return arrived;
    },
    undefined,
    { polling: 10 },
  );
}
