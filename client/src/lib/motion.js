// The one place the app's motion goes through (design:
// docs/design/riso-v2-grocery-check-feedback/README.md). Grocery's check feedback
// (the box, the tint, the strike-through, the flying name chip, the counts, the store
// footer, the dock, the toast) all start their animations here, so three things are true
// everywhere at once:
//
//   - Reduced motion: when the device asks for less, nothing moves. `play` drops every
//     property but colour and opacity, and the callers skip the chip and flash colour instead.
//     (The app's CSS rule that turns animations off cannot stop an animation started from
//     JavaScript, so this reads the same setting itself, on every call.)
//   - Slow motion, for checking the motion by eye: `?slowmo=4` multiplies every duration and
//     delay by 4. It exists only on the development server (`import.meta.env.DEV`); in the
//     built app that line is gone, so nobody can turn it on. No screen, no text.
//   - The same timings and easing everywhere (the README's table below).

// The README's easing tokens (§1).
export const EASE = {
  out: "cubic-bezier(0.2, 0.7, 0.2, 1)", // box, tint, strike, label, counts, footer, toast
  move: "cubic-bezier(0.5, 0, 0.2, 1)", // the flying chip
  linear: "linear", // flashes and text cross-fades
};

// Every [delay, duration] in milliseconds, from the README (§2 to §8).
export const T = {
  check: { box: [0, 160], row: [40, 160], strike: [40, 200], chip: [160, 260], count: [420, 160] },
  queue: { box: [0, 160], row: [0, 160], footer: [0, 200], label: [80, 160], chip: [120, 260], pulse: [380, 160] },
  back: { box: [0, 120], row: [0, 160], strike: [0, 200], footer: [0, 200], count: [0, 160], chip: [100, 260], flash: [300, 300] },
  storeCheck: { box: [0, 160], strike: [40, 200], chip: [160, 260], row: [240, 200], count: [420, 160] },
  roll: 160, // the footer's numbers
  dockIn: 180,
  toastIn: 160,
  toastSwap: 120,
  toastOut: 160,
  flash: 600, // reduced motion's colour flashes
  toastLife: 5000, // real time: slow motion never stretches it (Toast.jsx)
};

// Whether the device asks for less motion. Read on every call, so a change in the
// system setting counts at the next tap.
export function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// ---- Slow motion (development only) ------------------------------------------------
const SLOWMO_KEY = "mm.slowmo";

// The factor from `?slowmo=N` (kept in `storage`, the tab's sessionStorage, so it survives a
// page change in that tab), or from what the tab kept. `?slowmo=1` turns it off. Without
// `dev` it is always 1. Pure, so it is easy to test: `slowmo()` below is the one real caller.
export function readSlowmo({ dev = false, search = "", storage = null } = {}) {
  if (!dev) return 1;
  const keep = (value) => {
    try {
      if (value === 1) storage?.removeItem(SLOWMO_KEY);
      else storage?.setItem(SLOWMO_KEY, String(value));
    } catch {
      // storage can be blocked: the factor then lasts for this page only
    }
  };
  const asFactor = (raw) => {
    const n = Number(raw);
    return raw != null && raw !== "" && Number.isFinite(n) && n > 0 ? n : null;
  };
  const asked = asFactor(new URLSearchParams(search).get("slowmo"));
  if (asked != null) {
    keep(asked);
    return asked;
  }
  let kept = null;
  try {
    kept = asFactor(storage?.getItem(SLOWMO_KEY));
  } catch {
    // no storage
  }
  return kept ?? 1;
}

let factor = null;
export function slowmo() {
  if (factor == null) {
    factor = 1;
    if (import.meta.env.DEV && typeof window !== "undefined") {
      factor = readSlowmo({ dev: true, search: window.location.search, storage: window.sessionStorage });
      // The progress bars are CSS transitions: they read the factor from here.
      if (factor !== 1) document.documentElement.style.setProperty("--mm", String(factor));
    }
  }
  return factor;
}
// Read once at start, so the CSS variable is in place before the first tap.
slowmo();

// A duration or delay, slowed down in development when asked.
export const ms = (n) => n * slowmo();

// ---- Playing ----------------------------------------------------------------------
// Properties that may still change for someone who asked for less motion: colour and
// opacity. Anything that moves or resizes is dropped.
const CALM = new Set(["opacity", "backgroundColor", "color", "borderColor", "offset", "easing", "composite"]);
const calm = (frame) => Object.fromEntries(Object.entries(frame).filter(([key]) => CALM.has(key)));

// Starts an animation on `el` and gives it back (or null when the browser can't animate).
// With one keyframe the animation runs from it to the element's own style, so the resting
// look stays in CSS and the animation only plays from the old look to the new one.
// `delay` and `duration` are the README's, before slow motion.
export function play(el, keyframes, { duration = 160, delay = 0, easing = EASE.out, fill = "none" } = {}) {
  if (!el || typeof el.animate !== "function") return null;
  const frames = prefersReducedMotion() ? keyframes.map(calm) : keyframes;
  return el.animate(frames, { duration: ms(duration), delay: ms(delay), easing, fill });
}

// A colour flash that fades into the element's own colour (reduced motion's way of saying
// "this changed", README §7): 600 ms, linear.
export function flash(el, color, { property = "backgroundColor", duration = T.flash } = {}) {
  return play(el, [{ [property]: color }], { duration, easing: EASE.linear });
}

// Calls `fn` once when `animation` ends or is cancelled (at once when there is none).
export function whenDone(animation, fn) {
  if (!animation) {
    fn();
    return;
  }
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    fn();
  };
  animation.addEventListener("finish", once);
  animation.addEventListener("cancel", once);
}

// A new tap on the same row stops what that row is still doing (its box, tint and strike)
// and starts the next step. A chip in flight is not part of the row: it finishes on its own.
export function cancelRowAnimations(row) {
  row?.getAnimations?.({ subtree: true }).forEach((animation) => animation.cancel());
}

// "Pop": scale 0.6 (invisible) to 1.12 at 60% to 1 (§1).
export const POP = [
  { transform: "scale(0.6)", opacity: 0 },
  { transform: "scale(1.12)", opacity: 1, offset: 0.6 },
  { transform: "scale(1)", opacity: 1 },
];

// ---- The flying name chip (§2) -----------------------------------------------------
// The layer the chips fly in: one per screen, over the page, never taking a tap. In the
// page it covers the window; in Store mode (a window of its own) it sits inside it.
export function chipLayer(container) {
  if (typeof document === "undefined" || !container) return null;
  let layer = container.querySelector(":scope > .mm-chip-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "riso-theme mm-chip-layer";
    layer.setAttribute("data-theme", "light");
    layer.setAttribute("aria-hidden", "true");
    container.appendChild(layer);
  }
  return layer;
}

const centre = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

// Flies a pill with `text` between a row's name and a target (the cart's number, a store's
// Add button). `from` and `to` are viewport rects; `layer` is where it flies. Forward it lifts
// off the name and shrinks into the target; with `reverse` it comes out of the target and
// settles on the name. `tone`: "" (card), "queue" (blue, "+ name") or "store" (Store mode).
// Gives back the animation, or null when nothing should fly (reduced motion, no room).
export function flyChip(layer, { text, from, to, tone = "", reverse = false }) {
  if (!layer || !from || !to || prefersReducedMotion() || typeof layer.animate !== "function") return null;
  const bounds = layer.getBoundingClientRect();
  const chip = document.createElement("span");
  chip.className = `mm-chip${tone ? ` ${tone}` : ""}`;
  chip.textContent = text;
  // 14 px left of the name's left edge, centred on its first line.
  chip.style.left = `${from.left - 14 - bounds.left}px`;
  layer.appendChild(chip);
  chip.style.top = `${from.top + from.height / 2 - bounds.top - chip.offsetHeight / 2}px`;
  const start = centre(chip.getBoundingClientRect());
  const end = centre(to);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const at = (x, y, scale) => `translate(${x}px, ${y}px) scale(${scale})`;
  const frames = reverse
    ? [
        { transform: at(dx, dy, 0.35), opacity: 0, offset: 0 },
        { transform: at(dx, dy, 0.35), opacity: 1, offset: 0.12 },
        { transform: at(0, 0, 1), opacity: 1, offset: 0.85 },
        { transform: at(0, 0, 1), opacity: 0, offset: 1 },
      ]
    : [
        { transform: at(0, 0, 1), opacity: 0, offset: 0 },
        { transform: at(0, -6, 1.04), opacity: 1, offset: 0.15 },
        { transform: at(dx, dy, 0.35), opacity: 1, offset: 0.88 },
        { transform: at(dx, dy, 0.35), opacity: 0, offset: 1 },
      ];
  const [delay, duration] = tone === "queue" ? T.queue.chip : reverse ? T.back.chip : T.check.chip;
  // "both" keeps it unseen (its first keyframe is invisible) until the README's start.
  const animation = play(chip, frames, { duration, delay, easing: EASE.move, fill: "both" });
  if (animation) whenDone(animation, () => chip.remove());
  else chip.remove();
  return animation;
}
