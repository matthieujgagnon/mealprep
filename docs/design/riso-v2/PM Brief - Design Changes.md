# Design changes so far: brief for the PM

Project: The Matt Mo Cookbook, Riso v2 redesign
Where to look: **Final Desktop** (clickable desktop app) and **Final Mobile** (the same app in a 390px phone frame). Side-by-side desktop and phone views: Riso v2 Home Compare, Riso v2 Recipes Compare, Riso v2 Planner Compare, Riso v2 Makeable.

## What this is
The existing app was read screen by screen (notes in Baseline Audit.md) and rebuilt as a clickable prototype. Four screens are done and agreed: **Home, Recipes, Planner, Makeable**. The header and login are also rebuilt. Quebec French is first-class: every label has an EN and FR version and a FR | EN switch in the header.

## Decisions that apply everywhere
- **Wording:** "dinner" is now "supper" (Souper in French). This matches the app's own copy.
- **Colour roles** (full study in Riso v2 Pill Study):
  - Pink: expiring soon, and today in the planner.
  - Yellow: time pills and "to buy".
  - Green: ready now, nothing to buy, on sale.
  - Blue: primary action and selected state.
  - Black outline on every pill; thinner (1 to 1.5px) for small pills.
  - Shelf colours in the ingredient picker: Fridge cyan, Freezer violet, Pantry sand, Spice rack orange, Baking light pink.
- **Time and servings:** time is always a yellow pill; servings read "Serves 4" (FR: "4 portions"); meal type is an outlined chip.
- **Planned recipes** are marked "Planned Wednesday" in pink inside the recipe pop-out, and have their own "In your week" group in Makeable. No tag over the photo.

## Screen by screen

### Home
- Greeting by time of day, then a "Tonight · Supper" card with four states: recipe, note, empty, marked no meal.
- Grocery card on the right: count left, progress line, "Open list".
- Week strip with This week / Next week and a "Suppers only / All meals" toggle. In the all-meals grid only today and the current meal have a drop shadow. Next week has none.
- "To use" card: up to 5 items coloured by days to expiry, with an overflow link.
- "Proteins on sale": each protein expands to the products on sale with photo and details, and the rest of the page blurs while one is open. Makeable now is an optional third card; when it is empty, Proteins takes the space.

### Recipes
- "+ New recipe" lives inside the search bar. Cookbook / Imported tabs.
- Meal chips start with Meals, then a rule, then Makeable now and Uses expiring. Protein, Time and Sort are pill menus.
- A bulleted "How it works" strip. Phone follows the desktop layout instead of the app's folding sections (a deliberate difference from the app).

### Planner
- Week board with all 7 days; weekend days are configurable (any days, saved) and drawn as a grouped block with a pink dotted line.
- The only way to add a recipe is the search panel at the bottom, or drag and drop onto a slot. Clicking an empty slot opens a pop-up card with Recipe / Note / Empty card. Clicking a filled slot opens that recipe's pop-out only. Only the × removes a meal.
- Main meal ("Similar recipes"): pick one recipe as the base and the search shows recipes that share its ingredients, with leftovers placement.
- Ingredient picker ("Cook with"): expiring items first, then the shelves (Fridge, Freezer, Pantry and custom shelves) as collapsible drawers. A count pill shows how many you chose. There is no Done button; the × closes it.
- Phone keeps the bottom pop-up card.

### Makeable (new this round)
- Filter row: All / Makeable now / 1 or 2 to buy, then Expiring soon, Quick, Meal and Protein menus, and a "Show sales" toggle at the right.
- Groups: In your week (sorted by most to buy first), Ready now, One or two short, Needs a shop.
- Each card has Similar recipes and a **To buy** pill. To buy opens a panel on the card listing the missing ingredients with + Add each, a small "Add all" pill, and the items already on the grocery list (tap to remove). With Show sales on, sale ingredients get a green "-40 % Metro 5,99 $" tag.
- Clicking a card opens a centred pop-out (grows from the card, shrinks back on close, rest of the page blurred). It shows time, servings, meal, planned day, what you have, what to buy (tap to add or remove from the grocery list) and the steps. Buttons: Plan, Similar recipes, Open the full recipe.
- Similar recipes puts a yellow **Main meal** banner under the filters. Its ingredients are grouped (protein, produce, dairy, pantry) and can be toggled off to widen the search. Cancel clears it.
- Phone layout: segmented filter, pills in one row each, two-column cards.

## What is not done
- Not rebuilt yet (still v1, kept in Archive): Grocery, Flyers, Inventory, Cook mode, Store mode, Recipe card, Recipe editor.
- "Open the full recipe" opens the old v1 recipe card. The recipe card will be reworked next.
- Phone versions of Home, Recipes and Planner still need a last review.

## Open questions for the PM
1. **Sale data:** the green sale tags use made-up data. Which source should feed them (Flipp deals already imported on the Flyers page)?
2. **Main meal and leftovers:** this adds the idea of servings placed on other days. Is that in scope, or only the "similar recipes" search?
3. **Weekend setting:** stored per user? The prototype saves it in the browser only.
4. **Custom inventory shelves** (Spice rack, Baking) are shown in the ingredient picker. Should the picker follow the user's own shelves automatically?
5. **"In your week" in Makeable:** should it also appear on Recipes?
6. **French copy:** these strings are my guesses, not from the app's fr.js: greetings, meal letters in the all-meals grid, protein deal labels, savings phrase, "Mêmes/Recettes similaires", "Dans votre semaine". They need a native review.
