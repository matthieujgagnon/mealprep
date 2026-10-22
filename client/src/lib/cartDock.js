// Whether the cart's docked copy should show, from where the cart bar is now (hooks/useCartDock.js):
// `rect` is the bar's getBoundingClientRect(), `pinned` the height of the header pinned to the top of
// a phone's screen (0 when it isn't). The dock shows once the bar has gone out of sight ABOVE the
// screen: its bottom edge is higher than where the pinned header ends. A bar still in view, or still
// below the screen (the page opens with it under the fold when How it works is showing), shows no dock.
export function dockWanted(rect, pinned) {
  return !!rect && rect.bottom <= pinned + 1;
}
