import { useEffect, useLayoutEffect, useRef, useState } from "react";

// A button stuck to the bottom of a phone screen (position: sticky) floats over
// the page as it scrolls by. Some things must never be under it (Grocery's cart
// bar, a store's "+ Add N to inventory", the list's last row): while any of
// them is in the band the stuck button takes, this says `true`, and the button
// slides out of the way (CSS); it comes back once they've passed. The band is
// where the button sits when stuck: its own height, `bottom` px above the
// screen's bottom edge. Back in its own place at the end of the page, the
// button has all of them above it, so it never steps aside there.
//
// `targets()` returns the elements to keep clear, looked up on every check. A
// button that isn't drawn (display: none on a computer) never steps aside.
export function useStickyDodge(ref, targets, { bottom = 12 } = {}) {
  const [dodging, setDodging] = useState(false);
  const check = useRef(() => {});
  check.current = () => {
    const height = ref.current?.offsetHeight || 0;
    if (!height) {
      setDodging(false);
      return;
    }
    const low = window.innerHeight - bottom;
    const high = low - height;
    setDodging(
      targets().some((el) => {
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.bottom > high && r.top < low;
      })
    );
  };

  useEffect(() => {
    let frame = 0;
    const soon = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          check.current();
        });
      }
    };
    window.addEventListener("scroll", soon, { passive: true });
    window.addEventListener("resize", soon);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(soon) : null;
    observer?.observe(document.body);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", soon);
      window.removeEventListener("resize", soon);
      observer?.disconnect();
    };
  }, []);

  // After every render too: the page changes under it (a step, a footer, How it
  // works closed). Setting the same value again does nothing.
  useLayoutEffect(() => check.current());

  return dodging;
}
