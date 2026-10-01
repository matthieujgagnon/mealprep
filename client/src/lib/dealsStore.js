// This week's flyer deals, loaded once and shared by every tab that shows
// sales (Home, Recipes, Recipe card, Makeable, Grocery) - before, each tab
// fetched them on every visit. The Flyers page refreshes it whenever it
// changes deals (an import, an upload), and logging out clears it.
import { useEffect, useState } from "react";
import { api } from "../api.js";

const STALE_MS = 2 * 60 * 1000;

let state = { deals: [], loaded: false };
let fetchedAt = 0;
let inflight = null;
const subscribers = new Set();

function set(next) {
  state = next;
  for (const fn of subscribers) fn(state);
}

export function loadDeals({ force = false } = {}) {
  if (inflight) return inflight;
  if (state.loaded && !force && Date.now() - fetchedAt < STALE_MS) return Promise.resolve(state);
  inflight = api
    .getRealDeals()
    .then((deals) => {
      fetchedAt = Date.now();
      set({ deals, loaded: true });
    })
    .catch(() => set({ ...state, loaded: true }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

// After an import or upload: keep showing what's there, swap in the new
// week when it arrives.
export function refreshDeals() {
  fetchedAt = 0;
  return loadDeals({ force: true });
}

export function clearDeals() {
  fetchedAt = 0;
  set({ deals: [], loaded: false });
}

// { deals, loaded } - re-renders when the shared deals change. A copy older
// than a couple of minutes is shown straight away and refreshed behind it.
export function useDeals() {
  const [current, setCurrent] = useState(state);
  useEffect(() => {
    subscribers.add(setCurrent);
    setCurrent(state);
    loadDeals();
    return () => {
      subscribers.delete(setCurrent);
    };
  }, []);
  return current;
}
