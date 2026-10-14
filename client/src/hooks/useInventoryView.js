import { useState } from "react";

// Inventory's Compact / Tiles choice (Matt's design), kept in this browser for
// each account ("mealprep-inventory-view:<user id>"), so two people on one
// computer each keep theirs. Tiles to begin with, and whenever the browser
// won't keep it (private window, storage blocked). Only a view someone picks is
// saved, so a choice made before Tiles became the first view is kept.
export const INVENTORY_VIEWS = ["compact", "tiles"];
const KEY = "mealprep-inventory-view";
const keyFor = (userId) => `${KEY}:${userId || "guest"}`;

export function readInventoryView(userId) {
  try {
    const saved = localStorage.getItem(keyFor(userId));
    return INVENTORY_VIEWS.includes(saved) ? saved : "tiles";
  } catch {
    return "tiles";
  }
}

export function useInventoryView(userId) {
  const [view, setView] = useState(() => readInventoryView(userId));
  function choose(next) {
    if (!INVENTORY_VIEWS.includes(next)) return;
    setView(next);
    try {
      localStorage.setItem(keyFor(userId), next);
    } catch {
      /* kept for this visit only */
    }
  }
  return [view, choose];
}
