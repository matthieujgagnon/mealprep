import { useLayoutEffect, useRef, useState } from "react";

// How much the desktop header has to give so everything stays on one row:
//   0  everything inline: the language switch, name, Help and Log out
//   1  the name, Help and Log out move into the avatar menu (the one phones
//      use); the language switch stays in the open
//   2  as 1, and the logo, tabs and gaps tighten as well
//   3  tighter still (for the widest fonts)
//
// It measures instead of guessing a breakpoint, because what fits depends on
// the language ("Se déconnecter" is longer than "Log out"), on the person's
// name, on whether there's an Admin link, and on the fonts that actually
// loaded. A level is only moved up when something has wrapped onto a second
// row. The width a level failed at is remembered, and the roomier level is
// tried again only once the header is wider than that. `resetKey` forgets
// those widths (a new language or name changes what each level needs).
//
// Re-measures before paint, so there's no flash of the wrapped header.
const MAX_LEVEL = 3;

export function useHeaderCollapse(headerRef, { enabled, resetKey }) {
  const [level, setLevel] = useState(0);
  const failedAt = useRef([0, 0, 0]);
  const lastKey = useRef(resetKey);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header || !enabled) return undefined;
    if (lastKey.current !== resetKey) {
      lastKey.current = resetKey;
      failedAt.current = [0, 0, 0];
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
      const watched = [header.querySelector(level === 0 ? ".app-header-account" : ".app-header-phone-tools")];
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
