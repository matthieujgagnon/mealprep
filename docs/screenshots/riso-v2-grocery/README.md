# Grocery list: three-step checkbox, one Add to inventory per store

Screenshots against `docs/design/riso-v2-grocery/` (the README there first).

- `desktop-en-by-store.png`: 1280 wide, English, By store. How it works is open (its demo row still: the screenshot asks for less motion, so it doesn't step by itself). In Super C, Cilantro is bought ✓ and Old cheddar is queued + (light blue, "→ INVENTORY"), so the store ends with "1 queued · Old cheddar" and "+ Add 1 to inventory". The heading and the rows share one grid: ON SALE, RECIPE, BUY. Metro and IGA show their sale prices (green dot, price, ›). Super C is a store you made, so its heading has the ×.
- `desktop-en-by-aisle.png` and `desktop-en-by-recipe.png`: the same list By aisle and By recipe. The sale price has the store after it, and the group with the queued item has its own footer.
- `phone-fr-by-store.png`: 390 wide, French, By store, the window as tall as the page so the sticky « Je suis à l'épicerie » sits where it ends. How it works stacks, the pink cart bar is under it (« 2 DANS LE PANIER », « Terminé »), the queued row has « → INVENTAIRE » on its own line, and the footer stacks with the button across the width.
- `phone-en-store-mode.png`: Store mode, with Milk 2% queued on the list (+ in its box) and the smaller Colours pill.

The data is a test account made up for the screenshots (the browser test `e2e/grocery-three-steps.spec.js`, its "screenshot" tests and the Store mode one): five planned recipes, three flyer deals, two items typed in and a store you made. Re-take them with `npm run build`, then `npx playwright test e2e/grocery-three-steps.spec.js -g "screenshot|Store mode"`; the pictures land in `test-results/`.
