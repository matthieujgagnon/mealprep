// The small rules behind Home's two screens (design:
// docs/design/riso-v2-home-two-screens/). Home is one scroller holding two
// screens; these decide which dot is lit, how the scroller moves (free, snapping
// or stopping a flick at the join), and where a flick stops.

// The 0-based screen the dots light: the second once half of the scroller's
// height has passed the top of screen 2, else the first. `screen2Top` is
// screen 2's offsetTop inside the scroller.
export function activeScreen({ scrollTop, clientHeight, screen2Top }) {
  return scrollTop + clientHeight / 2 >= screen2Top ? 1 : 0;
}

// Whether every screen fits the scroller (a pixel of slack for rounding).
export function screensFit({ clientHeight, screenHeights }) {
  return clientHeight > 0 && screenHeights.every((h) => h <= clientHeight + 1);
}

// A touch screen (a phone, a tablet): the main pointer is a finger. A computer's
// is a mouse or a trackpad.
export const TOUCH_SCREEN = "(pointer: coarse)";

// The flick stop: on a phone, a flick never carries Home across the join between
// the two screens. Set this to false to go back to free scrolling there, with
// nothing else to change (docs/components.md, Home's two screens).
export const HOME_FLICK_STOP = true;

// How Home's scroller moves. On a computer it scrolls freely at every size: the
// mouse wheel and the trackpad fight a snap (a trackpad scroll shorter than half
// a screen springs back, a slow one wobbles), Matt's test of Oct 13. On a touch
// screen it snaps when both screens fit (a tablet); otherwise (a phone) a flick
// stops at the join, unless the flick stop is off. The dots jump either way.
export function scrollMode({ touchScreen, fits, flickStop = HOME_FLICK_STOP }) {
  if (!touchScreen) return "free";
  if (fits) return "snap";
  return flickStop ? "flick-stop" : "free";
}

// Where a coasting flick stops at the join, or null to let it run on. Coasting
// is what the scroller does on its own after a finger lifts from a swipe. `from`
// is where the scroller was when the finger lifted, `top` where it is now and
// `step` how far it moved since the last scroll event. Going down, a scroll that set off above the top of screen 2 stops on it;
// going up, one that set off below the end of screen 1 stops with that end at the
// bottom of the scroller. Anything that set off inside a screen and stays in it
// runs on. It stops one step early rather than one late, so the far screen never
// shows past the join (and a scroll already past it goes back to it).
export function flickStop({ from, top, step, screen2Top, clientHeight }) {
  const endOfScreen1 = Math.max(0, screen2Top - clientHeight);
  if (step > 0 && from < screen2Top - 1 && top + step >= screen2Top) return screen2Top;
  if (step < 0 && from > endOfScreen1 + 1 && top + step <= endOfScreen1) return endOfScreen1;
  return null;
}
