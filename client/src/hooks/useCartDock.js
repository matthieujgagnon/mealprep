import { useEffect, useState } from "react";
import { dockWanted } from "../lib/cartDock.js";

// The height of the page header while it is pinned to the top of a phone's screen (it is
// `position: sticky` there), else 0: the part of the window that rows and bars slide under.
export function pinnedHeaderHeight() {
  const header = typeof document === "undefined" ? null : document.querySelector(".app-header");
  return header && getComputedStyle(header).position === "sticky" ? Math.round(header.getBoundingClientRect().height) : 0;
}

// Whether the cart's docked copy should show: true while `bar` (the cart bar at the top of
// Grocery on a phone) has scrolled out of sight ABOVE the screen, that is, its bottom edge is
// higher than where the pinned header ends (design README §5: "the bar's bottom edge is above
// the top of the scroll area"; that area starts under the header). A bar that is still below the
// screen, or in view, shows no dock. It leaves at once when the bar comes back. Pass `null`
// (no bar: a computer) and it is always false.
//
// The bar is measured on every scroll, resize and change of layout (not watched by an
// IntersectionObserver: that reports only when the bar enters or leaves the screen, so a jump from
// below the screen straight to above it, a hard flick or the End key, would tell it nothing).
export function useCartDock(bar) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!bar) {
      setOn(false);
      return undefined;
    }
    let frame = 0;
    const check = () => {
      frame = 0;
      setOn(dockWanted(bar.getBoundingClientRect(), pinnedHeaderHeight()));
    };
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", soon, { passive: true });
    window.addEventListener("resize", soon);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(soon) : null; // How it works closed, a footer opened...
    observer?.observe(document.body);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", soon);
      window.removeEventListener("resize", soon);
      observer?.disconnect();
    };
  }, [bar]);
  return on;
}
