import { useLayoutEffect, useRef, useState } from "react";

// True while the header's inline account area (language switch, name, Help,
// Log out) doesn't fit beside the logo and has dropped to a second row. The
// header then moves the name, Help and Log out into the avatar menu (the one
// phones use) and keeps the language switch out in the open.
//
// It measures instead of guessing a breakpoint, because what fits depends on
// the language ("Se déconnecter" is longer than "Log out"), on how long the
// person's name is, and on whether there is an Admin link. When the inline
// version wraps, the width it failed at is remembered; the header tries the
// inline version again only once it is wider than that. `resetKey` forgets
// that width (a new language or name changes what the inline version needs).
//
// Re-measures before paint, so there's no flash of the wrapped header.
export function useHeaderCollapse(headerRef, { enabled, resetKey }) {
  const [collapsed, setCollapsed] = useState(false);
  const failedAt = useRef(0);
  const lastKey = useRef(resetKey);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header || !enabled) return undefined;
    if (lastKey.current !== resetKey) {
      lastKey.current = resetKey;
      failedAt.current = 0;
      if (collapsed) {
        setCollapsed(false);
        return undefined;
      }
    }

    let stale = false;
    const update = () => {
      if (stale) return;
      const width = header.clientWidth;
      if (collapsed) {
        if (width > failedAt.current) setCollapsed(false);
        return;
      }
      const logo = header.querySelector(".wordmark");
      const account = header.querySelector(".app-header-account");
      if (!logo || !account) return;
      // On a second row: its top is below the logo's bottom.
      if (account.offsetTop >= logo.offsetTop + logo.offsetHeight) {
        failedAt.current = width;
        setCollapsed(true);
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
  }, [headerRef, enabled, collapsed, resetKey]);

  return collapsed;
}
