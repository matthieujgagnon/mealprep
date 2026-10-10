import { expect } from "@playwright/test";

// Scrolls the page so a recipe card in the finder (`from`) and the Planner slot
// it will be dropped on (`to`) are on screen together, and a drag between them
// never has to scroll the page. It works from where the two really are, not from
// a number of pixels: the header, the board's rows and the finder change height
// whenever the design does (a fixed 450, then 530, broke each time).
//
// Near the top or bottom edge of the screen a drag scrolls the page by itself
// (the outer fifth), which would move the slot while the card is carried. So the
// slot is put a little below the top zone and the card's middle a little above
// the bottom edge. If the two are too far apart for the screen to hold both with
// that room, the screen is made as tall as it needs to be.
const ZONE = 0.2; // the part of the screen, at each edge, where a drag scrolls the page
const ROOM = 24; // px of room kept beyond it

export async function scrollBetween(page, from, to) {
  const [card, slot] = [await from.elementHandle(), await to.elementHandle()];
  const measure = () =>
    page.evaluate(([cardEl, slotEl]) => {
      const middle = (el) => {
        const r = el.getBoundingClientRect();
        return r.top + window.scrollY + r.height / 2;
      };
      return {
        card: middle(cardEl),
        slot: middle(slotEl),
        height: window.innerHeight,
        last: document.documentElement.scrollHeight - window.innerHeight,
      };
    }, [card, slot]);

  let now = await measure();
  const needed = Math.ceil((Math.abs(now.card - now.slot) + 2 * ROOM) / (1 - ZONE));
  if (now.height < needed) {
    await page.setViewportSize({ width: page.viewportSize().width, height: needed });
    await expect.poll(() => page.evaluate(() => window.innerHeight)).toBe(needed);
    now = await measure(); // the page may have reflowed
  }

  const y = Math.round(Math.max(0, Math.min(now.slot - (ZONE * now.height + ROOM), now.last)));
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(y);

  const at = await measure();
  const slotAt = at.slot - y;
  const cardAt = at.card - y;
  if (slotAt < ZONE * at.height || cardAt > at.height - ROOM / 2) {
    throw new Error(`The slot (at ${Math.round(slotAt)}px) and the recipe card (at ${Math.round(cardAt)}px) do not both fit on a ${at.height}px screen away from its edges`);
  }
  await expect(from).toBeInViewport();
  await expect(to).toBeInViewport({ ratio: 1 });
}
