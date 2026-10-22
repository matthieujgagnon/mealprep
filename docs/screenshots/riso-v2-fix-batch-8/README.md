# Fix batch 8: no meal-colour line on recipe cards, and « Masquer de Faisable »

Screenshots with local test data (six recipes with plain coloured pictures and a few Inventory items were
put in a throwaway database for the pictures; none of it is in the app).

- `en-1280-recipes-no-meal-line.png`: desktop (1280 px), English. Recipes: the Cookbook tiles have the meal, the
  protein and the time on top and the title at the bottom, and **no thin line in the meal's colour** any more (blue
  for supper, pink for lunch, yellow for breakfast). The meal type is the words only. The strip at the top says so too.
- `en-1280-card-menu-hide-from-makeable.png`: the recipe card's ⋯ menu, opened from a Makeable card. « Hide from
  Makeable » is new, between Move to Imported and Delete recipe (a hidden recipe shows « Show in Makeable » instead).
- `en-1280-hidden-toast-with-undo.png`: right after choosing it, the shared message at the bottom with Undo. Behind the
  card, Makeable has already left the recipe out of Ready now and the counts.
- `en-1280-makeable-hidden-list.png`: the bottom of Makeable. « Hidden from Makeable » (closed to begin with, with the
  count) lists each hidden recipe with its meal type and « Show again ↺ ». It is the same strip as Inventory's Recently
  removed, but the name is not struck through: the recipe is hidden, not removed.
- `en-1280-editor-switch.png`: the recipe editor, under « Prepared · nothing to cook ». The same choice as a switch,
  saved with Save changes.
- `fr-390-card-menu-masquer.png`: phone (390 px), Quebec French. The ⋯ menu with « Masquer de Faisable ».
- `fr-390-makeable-hidden-list.png`: phone, French. « Masquées de Faisable » open: on a phone the row keeps the name and
  « Afficher de nouveau ↺ » (the small meal-type word is left out, as in Grocery's « Déjà à la maison »).
