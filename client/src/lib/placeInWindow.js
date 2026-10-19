// Keeping a floating box inside the window: the one rule behind the Planner's slot
// cards (beside a slot) and the week calendar (under the date pill, and the day's
// meals beside it). Everything is in window coordinates, the same as
// getBoundingClientRect(), and a box is { width, height }.

export const WINDOW_MARGIN = 12;

// The window as a box. The width leaves out a vertical scrollbar, which is not
// somewhere a box can be seen.
export function viewSize() {
  return { width: document.documentElement.clientWidth || window.innerWidth, height: window.innerHeight };
}

// The left and top that keep `size` inside `view`, `margin` from every side. A box
// bigger than the window starts at the margin.
export function keepInside({ left, top }, size, view, margin = WINDOW_MARGIN) {
  return {
    left: Math.min(Math.max(margin, left), Math.max(margin, view.width - size.width - margin)),
    top: Math.min(Math.max(margin, top), Math.max(margin, view.height - size.height - margin)),
  };
}

// A box beside `anchor` (its rectangle): on the `prefer` side if it fits there, on the
// other side if it does not, and then shifted to stay inside the window. `limit` is
// the { left, right } the box has to fit between to count as fitting (the window,
// with its margin, when there is none). `align` says whether its top or its bottom
// lines up with the anchor's. Returns { left, top, side }.
export function placeBeside({ anchor, size, view, prefer = "right", gap = 16, align = "top", limit, margin = WINDOW_MARGIN }) {
  const room = limit || { left: margin, right: view.width - margin };
  const fits = (side) => (side === "right" ? anchor.right + gap + size.width <= room.right : anchor.left - gap - size.width >= room.left);
  const side = fits(prefer) ? prefer : prefer === "right" ? "left" : "right";
  const left = side === "right" ? anchor.right + gap : anchor.left - gap - size.width;
  const top = align === "bottom" ? anchor.bottom - size.height : anchor.top;
  return { ...keepInside({ left, top }, size, view, margin), side };
}

// The left of a box of `width` centred on `anchor`, shifted to stay inside the
// window sideways. Its top is the caller's (a box under its anchor can run past the
// bottom of the window: the page scrolls).
export function centerOn(anchor, width, view, margin = WINDOW_MARGIN) {
  const centred = anchor.left + anchor.width / 2 - width / 2;
  return Math.min(Math.max(margin, centred), Math.max(margin, view.width - width - margin));
}
