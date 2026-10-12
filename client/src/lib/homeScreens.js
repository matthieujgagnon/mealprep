// The small rules behind Home's two screens (design:
// docs/design/riso-v2-home-two-screens/). Home is one scroller holding two
// screens; these decide which dot is lit and whether the scroller may snap.

// The 0-based screen the dots light: the second once half of the scroller's
// height has passed the top of screen 2, else the first. `screen2Top` is
// screen 2's offsetTop inside the scroller.
export function activeScreen({ scrollTop, clientHeight, screen2Top }) {
  return scrollTop + clientHeight / 2 >= screen2Top ? 1 : 0;
}

// Snapping is only on when every screen fits the scroller (a pixel of slack for
// rounding). When one is taller (a phone, a short window) the scroller moves
// freely instead: in a screen taller than the window a snap point is a wall
// that an ordinary swipe or wheel tick bounces back from. The dots still follow
// and still jump.
export function screensFit({ clientHeight, screenHeights }) {
  return clientHeight > 0 && screenHeights.every((h) => h <= clientHeight + 1);
}
