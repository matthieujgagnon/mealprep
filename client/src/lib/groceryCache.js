// Your grocery stores (with which ingredient is filed where), kept between
// visits to the Grocery tab so the list can show straight away with every
// item already in its store. Anything that changes them elsewhere (the
// Flyers page's + List) clears this, so the list waits for fresh data
// instead of showing items in the wrong store first. (This week's deals
// are shared by every tab - see dealsStore.js.)
export const groceryShared = { sections: null };

export function invalidateGroceryShared() {
  groceryShared.sections = null;
}
