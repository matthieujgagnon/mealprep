# Ingredient names in the language shown

Made by `SHOTS_DIR=<folder> npx playwright test e2e/ingredient-names.spec.js`.

A recipe **written in English** on a phone (390 px) in **French**:

- `phone-fr-1-recipe-card.png`: the card's receipt, « Oignons rouges hachés finement », « Gousses d'ail hachées finement ». « Biryani masala » (not in the names table) is as written.
- `phone-fr-2-cook-before-you-start.png`: Cook mode's « Avant de commencer »: the names, and the how line made from the note in French (« Hachez finement »).
- `phone-fr-3-cook-for-this-step.png`: « Pour cette étape ».
- `phone-fr-4-makeable-pills.png`: Makeable's pills. A long name wraps to a second line before it is cut; « hauts de cuisse de poulet désossés sans peau » is too long even for two.
- `phone-fr-5-grocery.png`: the Grocery rows built from the recipe (a row typed by hand stays as typed).

A recipe **written in French** on a computer in **English**:

- `desktop-en-1-card-of-a-french-recipe.png`, `desktop-en-3-cook-of-a-french-recipe.png`, `desktop-en-4-makeable-of-a-french-recipe.png`, `desktop-en-5-grocery-of-a-french-recipe.png`: the same screens, read in English. The steps are the recipe's own text and stay in French.
- `desktop-en-2-card-of-an-english-recipe.png`: a recipe written in English, in English: exactly as written.
- `desktop-en-6-admin-ingredient-names.png`: the admin's list of names with no translation yet, and its Copy button.
