import { useEffect, useRef } from "react";

// The app's one press-and-hold drag, for anything a finger picks up: a Planner card,
// a grocery row, an Inventory item, a photo tile in the recipe form. Every drag setup
// (a `DndContext`) uses these two things, and the piece itself has `touch-action: pan-y`
// with the callout and text selection off (index.css: `.re-photo`, `.inv-row.draggable`...).
//
// A finger that has held still for `delay` picks the piece up; one that moves first
// (more than `tolerance`) is a swipe, and the page scrolls as usual.
export const HELD_DRAG = { delay: 200, tolerance: 8 };

// A finger that has held still long enough to pick something up must carry it without the
// page scrolling under it: once a drag is live, touch moves are not handed to the browser's
// scroll (which would cancel the drag). Before the drag starts a touch scrolls the page
// as usual. The listener is always on (and reads a ref) so it is already in place for the
// very first move. Returns the ref: set `.current = true` when the drag starts (onDragStart)
// and back to false when it ends or is cancelled.
export function useDragTouchGuard() {
  const dragLive = useRef(false);
  useEffect(() => {
    const onTouchMove = (e) => {
      if (dragLive.current && e.cancelable) e.preventDefault();
    };
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => window.removeEventListener("touchmove", onTouchMove);
  }, []);
  return dragLive;
}
