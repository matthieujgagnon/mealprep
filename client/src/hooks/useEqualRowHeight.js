import { useLayoutEffect } from "react";

// Every item in a view is the same height, and no name is ever cut. So the view
// is sized for its longest name: this finds the tallest text column among the
// items under `ref` and sets --gi-h (that plus padding) on it; the rows are
// max(--gi-min, --gi-h) tall in CSS. It measures again whenever the view draws,
// resizes or its fonts load. (A rare name that needs more room raises the height
// of every row in the view instead of being cut off.)
export function useEqualRowHeight(ref, { pad = 10 } = {}) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;

    function measure() {
      let tallest = 0;
      for (const row of root.querySelectorAll("[data-gi-row]")) {
        const text = row.querySelector("[data-gi-text]");
        if (text) tallest = Math.max(tallest, text.offsetHeight);
      }
      const next = tallest > 0 ? `${Math.ceil(tallest + 2 * pad)}px` : "0px";
      if (root.style.getPropertyValue("--gi-h") !== next) root.style.setProperty("--gi-h", next);
    }

    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(root);
    document.fonts?.ready?.then(measure).catch(() => {});
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  });
}
