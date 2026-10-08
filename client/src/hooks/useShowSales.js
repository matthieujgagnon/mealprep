import { useCallback, useState } from "react";

// The Makeable page's "Show sales" switch (the green % marks on a card and "N on
// sale"), on to begin with and remembered on this device: a choice already saved
// here, on or off, is kept. App.jsx keeps it so the recipe pop-out opened from
// Makeable shows the same green sale pills as the page.
const KEY = "mealprep-makeable-sales";

function load() {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === null ? true : saved === "on";
  } catch {
    return true;
  }
}

export function useShowSales() {
  const [on, setOn] = useState(load);
  const toggle = useCallback(() => {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
      // best-effort
    }
  }, [on]);
  return [on, toggle];
}
