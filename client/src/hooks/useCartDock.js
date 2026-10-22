import { useEffect, useState } from "react";

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
export function useCartDock(bar) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!bar || typeof IntersectionObserver === "undefined") {
      setOn(false);
      return undefined;
    }
    let observer = null;
    function watch() {
      observer?.disconnect();
      const pinned = pinnedHeaderHeight();
      observer = new IntersectionObserver(
        ([entry]) => setOn(!entry.isIntersecting && entry.boundingClientRect.bottom <= pinned + 1),
        { rootMargin: `-${pinned}px 0px 0px 0px` }
      );
      observer.observe(bar);
    }
    watch();
    window.addEventListener("resize", watch); // the header is pinned or not as the window turns
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", watch);
    };
  }, [bar]);
  return on;
}
