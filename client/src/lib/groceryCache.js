// What the grocery list last loaded that isn't tied to one week - your
// stores (with which ingredient is filed where) and this week's flyer
// deals - kept between visits to the tab so the list can show straight
// away, with every item already in its store. Anything that changes them
// elsewhere (the Flyers page's + List, an import) clears this, so the list
// waits for fresh data instead of showing items in the wrong store first.
export const groceryShared = { sections: null, deals: null };

export function invalidateGroceryShared() {
  groceryShared.sections = null;
  groceryShared.deals = null;
}
