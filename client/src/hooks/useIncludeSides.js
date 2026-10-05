import { useCallback, useSyncExternalStore } from "react";

// "Include pantry and sides": the one switch for the "Makeable now" rule
// (isMakeableMeal in lib/mealSlots.js). It is shared by every page that
// counts or filters Makeable now, so they always agree, and it is kept in this
// browser so it stays as set. Off by default.
const KEY = "mealprep.makeableIncludeSides";
const listeners = new Set();
let current = read();

function read() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useIncludeSides() {
  const includeSides = useSyncExternalStore(subscribe, () => current, () => false);
  const setIncludeSides = useCallback((on) => {
    current = !!on;
    try {
      localStorage.setItem(KEY, current ? "1" : "0");
    } catch {
      // private window: the switch still works until the page is closed
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [includeSides, setIncludeSides];
}
