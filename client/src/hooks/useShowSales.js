import { useCallback, useState } from "react";

// The Makeable page's "Show sales" switch, off to begin with and remembered on
// this device. App.jsx keeps it so the recipe pop-out opened from Makeable shows
// the same green sale pills as the page.
const KEY = "mealprep-makeable-sales";

function load() {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
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
