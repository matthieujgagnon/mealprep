import { EASE, POP, T, cancelRowAnimations, flash, play, prefersReducedMotion } from "./motion.js";
import { BOUGHT, QUEUED, TO_BUY } from "./groceryChecks.js";

// What one grocery row does when its box moves from one step to another (design:
// docs/design/riso-v2-grocery-check-feedback/README.md §2 to §4 and §7 to §8). GroceryItem
// calls `playRow` after a step changes; the resting look is always CSS, so each animation
// only plays from the old look to the new one (a single keyframe: "from here to what the
// element is now"). The chip, the cart's number, the store footer and the toast are the
// list's (hooks/useCheckFeedback.js); this is only the row.
//
// The parts of a row are found by their data attributes, the same in a list row
// (variant "line") and in Store mode's row (variant "store"):
//   [data-gi-box]    the checkbox       [data-gi-mark]   its ✓ or +
//   [data-gi-name]   the name's box     [data-gi-strike] the name's text, which carries the line
//   [data-gi-label]  "→ INVENTORY"

const css = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();

// How a row looks on each step, read from the tokens in use on screen (so Store mode's
// dark and light themes come out right too). Used as the "from" of an animation.
function looks(row, store) {
  if (store) {
    return [
      { box: "transparent", opacity: 1, strike: "0% 2px" },
      { box: css(row, "--sm-accent"), opacity: 0.45, strike: "100% 2px" },
      { box: css(row, "--sm-accent"), opacity: 0.45, strike: "100% 2px" },
    ];
  }
  return [
    { box: css(row, "--riso-surface"), row: "transparent", name: css(row, "--riso-ink"), strike: "0% 2px" },
    { box: css(row, "--riso-accent"), row: css(row, "--riso-canvas"), name: css(row, "--riso-muted"), strike: "100% 2px" },
    { box: css(row, "--riso-accent"), row: css(row, "--riso-queued-tint"), name: css(row, "--riso-muted"), strike: "100% 2px" },
  ];
}

// "from the old look": the old value shows through any delay (fill backwards) and the new
// one takes over when it ends.
const fromOld = (el, frames, [delay, duration], easing = EASE.out) => play(el, frames, { duration, delay, easing, fill: "backwards" });

// The ✓ or + that has just left the box (going back to to buy) fades out with the box.
function ghostMark(box, from, duration) {
  const ghost = document.createElement("span");
  ghost.className = "mm-mark ghost";
  ghost.textContent = from === QUEUED ? "+" : "✓";
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.fontSize = `${parseFloat(getComputedStyle(box).fontSize) + (from === QUEUED ? 5 : 0)}px`;
  box.appendChild(ghost);
  const animation = play(ghost, [{ opacity: 1 }, { opacity: 0 }], { duration, easing: EASE.out });
  if (animation) animation.addEventListener("finish", () => ghost.remove());
  else ghost.remove();
}

// `row`: the row's own element. `from` and `to`: TO_BUY, BOUGHT or QUEUED.
export function playRow(row, from, to, { store = false } = {}) {
  if (!row || from === to) return;
  const one = (selector) => row.querySelector(selector);
  const box = one("[data-gi-box]");
  const mark = one("[data-gi-mark]");
  const name = one("[data-gi-name]");
  const strike = one("[data-gi-strike]");
  const label = one("[data-gi-label]");
  cancelRowAnimations(row); // a new tap on this row starts the next step from here

  // Reduced motion: no movement and no fade. The row says "this changed" with a flash of
  // colour that fades into its new background (README §7).
  if (prefersReducedMotion()) {
    flash(row, css(row, store ? "--sm-flash" : "--riso-flash"));
    return;
  }

  const was = looks(row, store)[from];
  const back = to === TO_BUY;

  if (store) {
    if (back) {
      // §8 uncheck: the row comes back to full strength, the line retracts, then the row
      // flashes (the chip is the list's).
      const [rowDelay, rowDuration] = T.back.row;
      fromOld(row, [{ opacity: was.opacity }], [rowDelay, rowDuration]);
      fromOld(box, [{ backgroundColor: was.box }], T.back.box);
      fromOld(strike, [{ backgroundSize: was.strike }], T.back.strike);
      ghostMark(box, from, T.back.box[1]);
      play(row, [{ backgroundColor: css(row, "--sm-flash") }], { duration: T.back.flash[1], delay: T.back.flash[0], easing: EASE.linear });
      return;
    }
    // §8 check
    fromOld(box, [{ backgroundColor: was.box }], T.storeCheck.box);
    play(mark, POP, { duration: T.storeCheck.box[1], easing: EASE.out });
    fromOld(strike, [{ backgroundSize: was.strike }], T.storeCheck.strike);
    fromOld(row, [{ opacity: was.opacity }], T.storeCheck.row);
    return;
  }

  if (back) {
    // §4 (also Undo of a bought item, without the footer's part, which is the footer's own)
    fromOld(box, [{ backgroundColor: was.box }], T.back.box);
    ghostMark(box, from, T.back.box[1]);
    fromOld(row, [{ backgroundColor: was.row }], T.back.row);
    fromOld(name, [{ color: was.name }], T.back.row);
    fromOld(strike, [{ backgroundSize: was.strike }], T.back.strike);
    // The row lights up where it has gone back to (fill none: not held during the delay).
    play(row, [{ backgroundColor: css(row, "--riso-flash") }], { duration: T.back.flash[1], delay: T.back.flash[0], easing: EASE.linear });
    return;
  }

  if (from === TO_BUY) {
    // §2: to buy -> ✓ (and the rare to buy -> + , which is Undo of "back on the list": §3 whole)
    const [boxAt, rowAt, strikeAt] = to === BOUGHT ? [T.check.box, T.check.row, T.check.strike] : [T.queue.box, T.queue.row, T.check.strike];
    fromOld(box, [{ backgroundColor: was.box }], boxAt);
    play(mark, POP, { duration: boxAt[1], delay: boxAt[0], easing: EASE.out });
    fromOld(row, [{ backgroundColor: was.row }], rowAt);
    fromOld(name, [{ color: was.name }], rowAt);
    fromOld(strike, [{ backgroundSize: was.strike }], strikeAt);
    if (to === QUEUED) labelIn(label);
    return;
  }

  // ✓ -> + (§3) and + -> ✓ (Undo of a queue: the box pops and the tint changes, nothing else)
  play(mark, POP, { duration: T.queue.box[1], delay: T.queue.box[0], easing: EASE.out });
  fromOld(row, [{ backgroundColor: was.row }], T.queue.row);
  if (to === QUEUED) labelIn(label);
}

// "→ INVENTORY" fades in and slides in from the left (§3).
function labelIn(label) {
  fromOld(label, [{ opacity: 0, transform: "translateX(-8px)" }], T.queue.label);
}

// Where a store footer's pieces sit when it is open (index.css .riso-group-foot: a 2 px top
// border and 14 px of padding), so a chip can fly to its button even while the footer is still opening.
const FOOT_BORDER = 2;
const FOOT_PAD = 14;

// The Add button of a store footer, where it ends up when the footer is open: a rect for the chip to
// fly to (and the button, to pulse), or null when there is none. Right even while the footer is
// still opening.
export function footerButtonTarget(footer) {
  const button = footer?.querySelector(".riso-group-foot-btn");
  if (!button) return null;
  const b = button.getBoundingClientRect();
  const top = footer.getBoundingClientRect().top + FOOT_BORDER + FOOT_PAD;
  return { left: b.left, top, width: b.width, height: b.height, right: b.left + b.width, bottom: top + b.height, button };
}

