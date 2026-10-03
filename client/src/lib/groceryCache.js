// Your grocery stores (with which ingredient is filed where) and the last
// loaded state of the list, kept between visits to the Grocery tab so the
// list can show straight away with every item already in its store and
// checked or not. Anything that changes the stores elsewhere (the Flyers
// page's + List) clears `sections`, so the list waits for fresh data instead
// of showing items in the wrong store first. (This week's deals are shared
// by every tab - see dealsStore.js.)
export const groceryShared = { sections: null, list: null };

export function invalidateGroceryShared() {
  groceryShared.sections = null;
}

// On logout: nothing of one account's list may show up for the next.
export function clearGroceryShared() {
  groceryShared.sections = null;
  groceryShared.list = null;
}
