import { useLayoutEffect, useRef, useState } from "react";

// How tight the desktop header has to get to stay on one row beside the
// language switch and the avatar button:
//   0  normal
//   1  the logo, tabs and gaps tighten
//   2  tighter still (for the widest fonts)
//
// It measures instead of guessing a breakpoint, because what fits depends on
// the language ("Planificateur" is longer than "Planner") and on the fonts that
// actually loaded. A level is only moved up when something has wrapped onto a
// second row. The width a level failed at is remembered, and the roomier level
// is tried again only once the header is wider than that. `resetKey` forgets
// those widths (a new language changes what each level needs).
//
// Re-measures before paint, so there's no flash of the wrapped header.
const MAX_LEVEL = 2;

export function useHeaderTightness(headerRef, { enabled, resetKey }) {
  const [level, setLevel] = useState(0);
  const failedAt = useRef([0, 0]);
  const lastKey = useRef(resetKey);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header || !enabled) return undefined;
    if (lastKey.current !== resetKey) {
      lastKey.current = resetKey;
      failedAt.current = [0, 0];
      if (level !== 0) {
        setLevel(0);
        return undefined;
      }
    }

    let stale = false;
    // Something is on a second row when its top is below the logo's bottom.
    const wrapped = () => {
      const logo = header.querySelector(".wordmark");
      if (!logo) return false;
      const bottom = logo.offsetTop + logo.offsetHeight;
      // From 1024px the tabs belong beside the logo (below that they take a
      // row of their own by design).
      const watched = [header.querySelector(".app-header-phone-tools")];
      if (window.matchMedia("(min-width: 1024px)").matches) watched.push(header.querySelector(".tabs"));
      return watched.some((el) => el && el.offsetParent !== null && el.offsetTop >= bottom);
    };
    const update = () => {
      if (stale) return;
      const width = header.clientWidth;
      if (level > 0 && width > failedAt.current[level - 1]) {
        setLevel(level - 1); // try the roomier layout again
        return;
      }
      if (level < MAX_LEVEL && wrapped()) {
        failedAt.current[level] = width;
        setLevel(level + 1);
      }
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    // Web fonts change the widths without changing the header's.
    document.fonts?.ready.then(update);
    return () => {
      stale = true;
      observer.disconnect();
    };
  }, [headerRef, enabled, level, resetKey]);

  return level;
}
