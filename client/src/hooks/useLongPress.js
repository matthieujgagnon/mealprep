import { useRef } from "react";

// Press and hold: `onLongPress` runs once the finger (or mouse button) has stayed
// put for `delay` ms. Moving more than `tolerance` px, or lifting, cancels it, so
// a swipe still scrolls and a tap still taps. After a long press the click that
// follows is swallowed (so the row is not also checked). A right click or the
// browser's own long-press menu counts as a long press too.
//
// Spread the result on the element: <div {...useLongPress(fn)}>.
export function useLongPress(onLongPress, { delay = 500, tolerance = 10 } = {}) {
  const state = useRef({ timer: null, x: 0, y: 0, fired: false });

  function clear() {
    clearTimeout(state.current.timer);
    state.current.timer = null;
  }
  function fire() {
    clear();
    if (state.current.fired) return;
    state.current.fired = true;
    onLongPress();
  }

  return {
    onPointerDown(e) {
      if (e.button != null && e.button !== 0) return;
      state.current.fired = false;
      state.current.x = e.clientX;
      state.current.y = e.clientY;
      clear();
      state.current.timer = setTimeout(fire, delay);
    },
    onPointerMove(e) {
      if (state.current.timer && Math.hypot(e.clientX - state.current.x, e.clientY - state.current.y) > tolerance) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onClickCapture(e) {
      if (!state.current.fired) return;
      state.current.fired = false;
      e.preventDefault();
      e.stopPropagation();
    },
    onContextMenu(e) {
      e.preventDefault();
      fire();
    },
  };
}
