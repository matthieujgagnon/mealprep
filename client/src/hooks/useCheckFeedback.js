import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { BOUGHT, QUEUED, TO_BUY } from "../lib/groceryChecks.js";
import { footerButtonTarget } from "../lib/checkMotion.js";
import { EASE, T, chipLayer, flyChip, play, prefersReducedMotion, whenDone } from "../lib/motion.js";
import { readTheme } from "../lib/theme.js";
import { pinnedHeaderHeight } from "./useCartDock.js";
import { t } from "../i18n/index.js";

// What happens around a grocery row when its box moves a step, besides the row's own motion
// (lib/checkMotion.js): the one toast with Undo, the name chip flying to where the item is now
// counted, the cart's count (which changes when the chip lands) and a footer pulse. Grocery's
// list and Store mode both use it. Design:
// docs/design/riso-v2-grocery-check-feedback/README.md §0, §2 to §6, §10.
//
//   const feedback = useCheckFeedback({ onToast, nameOf, isChecked });
//   feedback.stepped({ key, from, to, rowEl, store, undo, undoTo })   // after each change of step
//   feedback.flights   { key: chips on their way to the cart }: the cart's number leaves those out
//   feedback.pulse     { n, dir }: n changes whenever the cart's count just changed (dir 1 / -1)
//
// Nothing here waits: a tap changes the screen at once and everything after it is a flourish
// that can run alongside the next tap. A chip is an element in its own layer, so twenty can fly
// together; a new tap on the same row only stops that row's own animations.

const NAME = "\u0000";

// The toast's words for a step: the item's name, then where it went. { name, rest } when the
// sentence begins with the name (both languages do), else the sentence whole.
export function toastMessage(to, name) {
  const key = to === TO_BUY ? "grocery.toastBack" : to === QUEUED ? "grocery.toastQueued" : "grocery.toastInCart";
  const parts = t(key, { name: NAME }).split(NAME);
  if (parts.length === 2 && parts[0] === "") return { name, rest: parts[1].trim() };
  return t(key, { name });
}

// Where the cart's count is on screen: Store mode's big number; else the docked copy when it is
// showing, the cart bar (phone), or the card (computer).
function cartNumber(store) {
  if (store) return document.querySelector(".store-mode-num");
  return (
    document.querySelector(".riso-grocery-dock [data-cart-num]") ||
    document.querySelector(".riso-grocery-cartbar [data-cart-num]") ||
    document.querySelector(".riso-grocery-cart [data-cart-num]")
  );
}

// Whether a rect is on screen (under the pinned header and over the docked cart doesn't count).
function inView(rect, { clearDock = false } = {}) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  const dock = clearDock ? document.querySelector(".riso-grocery-dock") : null;
  const floor = dock ? dock.getBoundingClientRect().top : window.innerHeight;
  return rect.bottom > pinnedHeaderHeight() + 4 && rect.top < floor && rect.right > 0 && rect.left < window.innerWidth;
}

// The first line of an item's name: where its chip lifts off and comes back to.
function nameRect(row) {
  const text = row?.querySelector("[data-gi-strike]");
  return text?.getClientRects()[0] || text?.getBoundingClientRect() || null;
}

// The row that was tapped, or (Undo from the toast) the item's row as it is now.
function rowFor({ rowEl, key, store }) {
  if (rowEl?.isConnected) return rowEl;
  return document.querySelector(`${store ? ".store-mode" : ".riso-group"} [data-gi-row][data-gi-key="${CSS.escape(key)}"]`);
}

const PULSE = [{ transform: "scale(1)" }, { transform: "scale(1.06)", offset: 0.4 }, { transform: "scale(1)" }];

export function useCheckFeedback({ onToast, nameOf, isChecked }) {
  const latest = useRef({});
  latest.current = { onToast, nameOf, isChecked };
  const [flights, setFlights] = useState({});
  const flightsRef = useRef({});
  const [pulse, setPulse] = useState({ n: 0, dir: 1 });
  const pending = useRef([]);

  const bump = useCallback((dir) => setPulse((p) => ({ n: p.n + 1, dir })), []);
  const startFlight = useCallback((key) => {
    flightsRef.current = { ...flightsRef.current, [key]: (flightsRef.current[key] || 0) + 1 };
    setFlights(flightsRef.current);
  }, []);
  // The chip landed (or never flew): the item is counted now, and the number bumps.
  const endFlight = useCallback(
    (key) => {
      const left = (flightsRef.current[key] || 0) - 1;
      const next = { ...flightsRef.current };
      if (left > 0) next[key] = left;
      else delete next[key];
      flightsRef.current = next;
      setFlights(next);
      if (left <= 0 && latest.current.isChecked(key)) bump(1);
    },
    [bump]
  );

  // Called right after a row's step changed (the screen is already on its way to the new state).
  const stepped = useCallback(
    ({ key, from, to, rowEl, store = false, undo = false, undoTo }) => {
      if (from === to) return;
      const { onToast: toast, nameOf: nameFor } = latest.current;
      const name = nameFor(key);

      // One toast, with the item's name and Undo; a new tap replaces its text. Undo itself
      // says nothing more: the row moving back is the answer.
      if (!undo && toast) {
        toast(toastMessage(to, name), undoTo, { replace: true, variant: store ? `store-${readTheme()}` : undefined });
      }

      const plan = { key, name, from, to, rowEl, store };
      if (from === TO_BUY && to === BOUGHT) {
        // To the cart: counted when the chip lands (lag), at once when nothing flies.
        const target = cartNumber(store);
        if (!prefersReducedMotion() && rowEl && inView(target?.getBoundingClientRect())) {
          startFlight(key);
          pending.current.push({ ...plan, kind: "cart" });
        } else {
          bump(1);
        }
      } else if (to === QUEUED) {
        // To the store's Add button. Back from "back on the list" it is in the cart again too.
        if (from === TO_BUY) bump(1);
        pending.current.push({ ...plan, kind: "queue" });
      } else if (to === TO_BUY) {
        // Out of the cart: counted at once. (An item whose chip is still flying was never counted.)
        if (!(flightsRef.current[key] > 0)) bump(-1);
        pending.current.push({ ...plan, kind: "back" });
      }
      // + back to ✓ (Undo of a queue): the box pops and the tint changes; nothing flies.
    },
    [bump, startFlight]
  );

  // After the screen has changed (a footer that has just opened, the dock that has just come
  // up): start the flights.
  useLayoutEffect(() => {
    if (pending.current.length === 0) return;
    const batch = pending.current;
    pending.current = [];
    for (const plan of batch) launch(plan, endFlight);
  });

  return { flights, pulse, stepped };
}

function launch(plan, endFlight) {
  const { kind, key, name, store, to } = plan;
  const row = rowFor(plan);
  const from = nameRect(row);
  const layer = chipLayer(store ? row?.closest(".store-mode") : row?.closest(".riso-grocery"));
  const tone = store ? "store" : "";

  if (kind === "cart") {
    const target = cartNumber(store)?.getBoundingClientRect();
    const animation = inView(target) ? flyChip(layer, { text: name, from, to: target, tone }) : null;
    // The count goes up when the chip lands (README: at 420 ms); at once when it couldn't fly.
    whenDone(animation, () => endFlight(key));
    return;
  }

  if (kind === "queue") {
    if (prefersReducedMotion()) return; // the footer flashes instead (GroceryParts)
    const footer = row?.closest(".riso-group")?.querySelector(".riso-group-foot");
    const target = footerButtonTarget(footer);
    // Out of sight (or under the dock): no chip and no pulse; the footer still opens or rolls.
    if (!target || !inView(target, { clearDock: true })) return;
    flyChip(layer, { text: `+ ${name}`, from, to: target, tone: "queue" });
    play(target.button, PULSE, { duration: T.queue.pulse[1], delay: T.queue.pulse[0], easing: EASE.out });
    return;
  }

  // Back on the list: the chip comes out of the cart's number and settles on the name.
  const target = cartNumber(store)?.getBoundingClientRect();
  if (inView(target) && to === TO_BUY) flyChip(layer, { text: name, from, to: target, tone, reverse: true });
}
