# Recipe card + Similar recipes: handoff

Rebuild the recipe card in `client/src/components/RecipeDetailModal.jsx` and its `.riso-rc-*` styles in `client/src/index.css` to match `Recipe Card.dc.html`. This card **replaces `RecipePopout.jsx`**: Planner, Makeable, Recipes and Home all open this one card. Delete the pop-out and its `.fnd-pop-*` styles once every caller opens the card.

## About the design files
`Recipe Card.dc.html` is a **design reference built in HTML**, not production code. It shows the intended look and behaviour; rebuild it with the app's existing React components, CSS conventions and i18n. Open the file in a browser (it needs `support.js` beside it). Everything on it is clickable: servings, the Prices switch, steps, timers, Similar recipes and the ingredient chips.

## Fidelity
**High fidelity.** Colours, type, spacing, radii and copy are final. Match them exactly.

Prices, store names and inventory amounts in the file are sample data. Real values come from flyers, the price table and Inventory (see "Data").

---

## 1. Computer (1440 screen)

The card is a modal on the grey page backdrop (`#8b8a86`, 40px padding).
- **Card:** `#fffdf8`, 2px `#16181f` border, radius 26px, shadow `6px 6px 0 #16181f`, overflow hidden.
- **Body:** a 2-column grid, `440px | 1fr`, with a full-width footer under it.

### 1.1 Left column (`#f4f1ea`, 2px right border)
- **Photo:** 340px tall with a 2px bottom border, `object-fit: cover`.
  - Top left: a "← Recipes" pill (38px, radius 19px, white, 2px border, 700 13.5px).
  - Bottom right: a "1 / 3 photos" chip (26px, DM Mono 500 10.5px).
- **Receipt:** under the photo, padding 34px 22px 30px.
  - Box: white, 2px border, radius `6px 6px 20px 20px`, padding 24px 20px 20px, gap 12px.
  - **Sticker:** yellow, centred on the receipt's top edge (top -20px, left 14px, rotate -4°). Text "{n} things to buy", 800 15px, `#ffe14d`, shadow `3px 3px 0`.
  - **Header row:** "TO BUY · {n}" (DM Mono 500 11px, 0.12em) on the left. On the right, the servings stepper: two 28px round − / + buttons around "{n} servings" (800 14px, min-width 78px).
  - **To buy rows:** min-height 54px, separated by `2px dotted #bdb6a6`.
    - A 26px round mark: green `#10c95c` ✓ if it's already on the grocery list, white + if not.
    - The name in 800 15.5px/19px, and a DM Mono 500 11px meta line ("1 · METRO · ON YOUR LIST").
    - On the right, the price in 800 15.5px, and below it a source tag: pill, 1.5px border, DM Mono 9.5px. It reads SALE on `#ffe14d`, FLYER on white, or MEDIAN on white.
  - **"To buy ≈ $x.xx"** row: 800 15.5 / 800 17.
  - **"Add to grocery list":** 38px pill, centred, 700 13px.
  - **In your Inventory:**
    - Header: an 18px blue `#2323ff` ✓ circle, then "In your Inventory · 9" in 800 17px, with a 2px ink bottom border.
    - Rows: min-height 38px, separated by `1.5px dashed #d6cfbf`. The name in 600 14.5px. The amount this recipe uses in DM Mono 500 12px `#3f3e37`.
    - Spinach and other expiring items get a pink "Use soon!" sticker (`#ff48b0`, rotate -4°, 800 10.5px).
  - **Totals** (hidden when Prices is off):
    - "From inventory ≈ $x" in 700 14.5px `#3f3e37`.
    - Then a 2px ink rule, then "This meal" (800 18px) with "≈ $x A SERVING" (DM Mono 11px) under it. On the right, "≈ $x" in 800 26px.

### 1.2 Right column
**Header block: exactly 340px tall,** so its bottom line lines up with the photo's bottom border. It is a flex column:
1. **Top bar:** padding 18px 22px 0 48px. Right-aligned: ⋯ and ×, both 36px circles with a 2px border.
2. **Title area** (flex 1, vertically centred, padding 0 48px, gap 14px):
   - Title: "Sheet-pan chicken shawarma", 800 52px/1, letter-spacing -0.03em.
   - **Fact line:** 600 18px `#3f3e37`, with `·` separators in `#bdb6a6` (padding 0 10px). The values are 800 ink:
     - `45 min · Serves {n} · ≈ $19.93 (yellow highlight: #ffe14d, radius 6px, padding 0 6px) $4.98 / SERVING (DM Mono 500 12px #5e5b52) · Keeps 3 days`
     - The estimate and the per-serving text are hidden when Prices is off.
3. **Action row:** padding 0 48px 26px, gap 10px, items centred. Pills are 48px tall, radius 24px, 2px border, padding 0 20px.
   - **Start cooking:** `#2323ff` background, white text, 800 16.5px, padding 0 26px, shadow `3px 3px 0 #16181f`.
   - **Plan:** white, 700 14.5px.
   - **Similar recipes:** `#f4f1ea`, 700 14.5px. Opens the similar view (§3).
   - **Open full recipe ↗:** white, 700 14.5px. Opens the source URL in a new tab.
   - A flex spacer, then the **Prices switch** at the far right:
     - Pill: 32px, radius 16px, 2px border, "Prices" in 700 12.5px.
     - Track: 36×22, radius 11px, 2px border, `#2323ff` when on and white when off.
     - Knob: 14px, white with a 2px border, left 14px when on and 2px when off.

**Steps** (2px top border, padding 24px 48px 30px):
- **Header:** "STEPS · 4" on the left. On the right, "STEP n OF 4" or "ALL DONE" in `#2323ff`, both DM Mono 11px.
- **Rows:** a grid of `44px | 1fr | 200px`, gap 20px. The whole row is clickable.
- **Rail dot** (same as the Cook mode rail):
  - Done: 30px ink circle with a white ✓.
  - Current: 44px `#2323ff` circle with a white number and shadow `3px 3px 0 #16181f`.
  - Upcoming: 30px white circle with an ink number.
  - The dots are joined by a `2px dotted #bdb6a6` line.
- **Text:**
  - Label: DM Mono 11px. Ink on the current step, `#5e5b52` on the others.
  - Step text: Bricolage 500, **24px on the current step and 19px on the others**, line-height 1.42, max-width 720px. Text on done steps is `#5e5b52`.
- **Timer** (right column, only on steps that have one):
  - A 38px pill, radius 19px, 2px border, 800 15px, tabular numbers.
  - When the timer has started, a 38px round ↺ reset button appears next to it.
  - The timer states are in §4.

**Notes** (2px top border, padding 20px 48px 30px, pushed to the bottom with `margin-top:auto`):
- "NOTES" label.
- Textarea: 3 rows, 2px border, radius 16px, `#f4f1ea`, 500 16px/1.45, placeholder "Add a note for next time".

### 1.3 Footer: Uses the same ingredients
Full card width. 2px top border, `#f4f1ea`, padding 28px 40px 36px, gap 18px.
- **Heading row:** "Uses the same ingredients" (800 28px) with "Cook one of these next to finish what's left." (Inter 15px `#3f3e37`) on the same line.
- **Cards:** 4 per row, gap 18px.
  - Each card: white, 2px border, radius 20px, shadow `4px 4px 0`.
  - Photo: 170px tall. A yellow "{n} SHARED" sticker sits bottom left (DM Mono 10.5px, rotate -4°).
  - Text: the name in 800 17px, and "35 MIN · ≈ $3.95 / SERVING" in DM Mono 11px. The price part is hidden when Prices is off.
- These are the top four results from the similar-recipes search (§3).

---

## 2. Phone (390)
One scrolling column, with a fixed bottom bar.
- **Photo:** 260px tall with a 2px bottom border.
  - Top row of 40px circles: ← on the left; ⋯ and × on the right.
  - Bottom left: the "{n} things to buy" sticker (800 14px). Bottom right: a "1 / 3" chip.
- **Header** (padding 20px 18px 18px, gap 10px):
  - Title in 800 32px/1.02.
  - The fact line in 600 15.5px, without the per-serving text.
  - A row of two 38px pills: **Similar recipes** (`#f4f1ea`) and **Full recipe ↗** (white).
  - A row with "$x / SERVING" (DM Mono 10.5px) on the left and the Prices switch (34px) on the right.
- **Receipt:** 2px top border, `#f4f1ea`, padding 30px 14px 22px.
  - The same structure as on the computer, slightly smaller: 32px stepper buttons and a 44px "Add to grocery list".
- **Steps:** the same rail at a smaller size.
  - Dots are 26px; the current dot is 36px.
  - Text is 16px, and 19px on the current step.
  - The timer pill (40px) sits **under** the step text instead of in a side column.
- **Notes:** the same as on the computer.
- **Footer:** "Uses the same ingredients" (800 21px). The cards scroll sideways; each is 200px wide with a 120px photo.
- **Bottom bar:** fixed. 2px top border, white, padding 12px 14px 26px, gap 10px.
  - **Start cooking** fills the width: 54px tall, radius 27px, `#2323ff`, 800 17px, shadow `3px 3px 0`.
  - **Plan** sits at its own width on the right: 54px, white, 700 15px.
- **Similar recipes on the phone:** replaces the scroll area inside the card.
  - A yellow banner reads "Uses the same ingredients", with "← Back to the recipe" under it.
  - Then the count, then a 2-column grid of 3:4 recipe cards.

---

## 3. Similar recipes (replaces the card's content)
Pressing **Similar recipes** swaps the whole inside of the card (both columns and the footer) for the similar view. The modal frame, its border and its shadow stay. **← Back** puts the recipe back exactly as it was: servings, current step, running timers and the Prices setting are all kept.

**Computer layout** (padding 22px 40px 40px, gap 20px, min-height 900px):
- **Top row:**
  - "← Back to {recipe title}": a 44px pill with a 30px round photo of the recipe inside it.
  - A spacer, then × (which closes the modal).
- **Title:** "Similar recipes", 800 44px.
- **Yellow banner:** `#ffe14d`, 2px border, radius 20px, shadow `4px 4px 0`.
  - "Uses the same ingredients as {title}" in 800 18px.
  - Then one chip per ingredient of the recipe (To buy and Inventory both count), 32px tall.
    - Included: ink background with white text.
    - Left out: white background, `#5e5b52` text, struck through.
    - **Tapping a chip toggles it.**
  - Under the chips: "TAP AN INGREDIENT TO LEAVE IT OUT", or "{n} LEFT OUT" (DM Mono 10.5px).
- **Count:** "{n} RECIPES SHARE ITS INGREDIENTS" (DM Mono 11px).
- **Grid:** 4 columns, gap 24px.
  - Cards are the same 3:4 photo cards used on the Recipes page, with a 2px border, radius 20px, a top scrim and a bottom scrim.
  - Captions: the meal and the time at the top (DM Mono 10.5px, uppercase, white).
  - A yellow "{n} SHARED" sticker sits at top 40px, left 14px.
  - The title is centred at the bottom in 700 19px white.
  - Tapping a card opens that recipe's card.

**Search logic:**
- `shared(r) = number of ingredients in recipe r that are in the current recipe's ingredient set, minus the ingredients left out`.
- Show the recipes with `shared > 0`, sorted by `shared` descending; break ties by fewest missing, then by time.
- The footer (§1.3) shows the top 4 with no ingredients left out.

---

## 4. Interactions and state

| State | Type | Default | Notes |
|---|---|---|---|
| `servings` | int, steps of 2, 2–8 | the recipe's servings | Rescales every amount and price. If a needed amount goes over the stock, the difference is added to To buy with the line "{amount} MORE · {store}". |
| `showPrices` | bool | true | **Saved per user, not per recipe.** Hides: To buy prices and source tags, the To buy total, From inventory, This meal, the estimate in the fact line, and the footer card prices. |
| `currentStep` | int 0–n | 0 | Clicking a step makes it current. Clicking the current step marks it done and moves to the next one. Steps before it show as done. |
| `timers` | map stepIndex → {left, running, done} | {} | Independent per step. Several can run at once. Keep them running while Similar is open. |
| `similarOpen` | bool | false | §3. |
| `leftOut` | string[] | [] | The ingredient chips in the similar view. |
| `notes` | string | saved | Saved with the recipe. |

**Timer pill states** (pressing a timer must not change the current step, so stop the click from reaching the row):
- **Idle:** "▶  Start 20 min", `#ffe14d`, shadow `2px 2px 0`.
- **Running:** "❚❚  19:42", `#16181f` background, `#ffe14d` text, no shadow. Press it to pause.
- **Paused:** "▶  19:42", white. Press it to resume.
- **Done:** "✓  Time's up", `#10c95c`, shadow `3px 3px 0`. Press it to restart.
- **↺** resets the timer to idle. It's shown whenever the timer has started.

Read the timer length from the step's timer field ("⏱ 20 min" → 20 minutes).

## 5. Data
- **Prices** (rules in `Meal pricing.md`):
  - Each ingredient takes, in order: the current flyer sale price (SALE + store), then the regular flyer price (FLYER + store), then the median price for that ingredient (MEDIAN).
  - **To buy** is priced per package.
  - **From inventory** is priced by the amount the recipe uses.
  - Per serving = This meal ÷ servings.
  - Show every price as an estimate with "≈".
- **In your Inventory:** match each recipe ingredient to an Inventory item. Show the amount the recipe uses. Short items move to To buy.
- **To buy:** an ingredient that's missing, or short. If it's already on the grocery list, show the green ✓ and "ON YOUR LIST" in its meta line.
- **Similar:** needs each recipe's ingredient list, normalized the same way as the Inventory matching.

## 6. Design tokens
- **Ink:** `#16181f`. **Surface:** `#fffdf8`. **Cream:** `#f4f1ea`. **Page backdrop:** `#8b8a86`.
- **Muted text:** `#5e5b52`. **Body grey:** `#3f3e37`.
- **Rules:** `#bdb6a6` (dotted), `#d6cfbf` (dashed).
- **Blue:** `#2323ff`. **Yellow:** `#ffe14d`. **Pink:** `#ff48b0`. **Green:** `#10c95c`.
- **Type:**
  - Bricolage Grotesque 500–800 for headings, names, buttons and step text.
  - DM Mono 500 for caps labels (letter-spacing 0.1–0.12em) and amounts.
  - Inter 400 for helper sentences only.
- **Borders:** 2px ink on all containers and pills; 1.5px on small tags.
- **Radii:**
  - Card 26px.
  - Receipt `6 6 20 20`.
  - Pills: half their height.
  - Recipe cards 18–20px.
  - Textarea 16px.
- **Shadows:** hard offsets only: `3px 3px 0` on main buttons and stickers, `4px 4px 0` on cards and banners, `6px 6px 0` on the modal.

## 7. Copy (English; add French to `fr.js`)
- **Existing keys to reuse:** `recipeCard.notes`, `recipeCard.similarTitle` ("Uses the same ingredients"), `recipeCard.similarNote`, `recipeCard.shared` ("{count} SHARED"), `finder.similar` ("Similar recipes"), `finder.plan`.
- **New strings:**
  - "Start cooking", "Open full recipe", "Prices", "{n} servings"
  - "In your Inventory · {n}", "To buy", "From inventory", "This meal", "≈ {price} A SERVING", "{price} / SERVING"
  - "Add to grocery list", "Add a note for next time"
  - "STEP {n} OF {total}", "ALL DONE"
  - "Start {n} min", "Time's up"
  - "Similar recipes", "← Back to {title}", "Uses the same ingredients as {title}"
  - "TAP AN INGREDIENT TO LEAVE IT OUT", "{n} LEFT OUT", "{n} RECIPES SHARE ITS INGREDIENTS"
  - "SALE", "FLYER", "MEDIAN", "{amount} MORE · {store}"

## 8. Assets
- The photos in the file are stock demo images (Unsplash). In the app, use the recipe's own photos.
- Ingredient names and emoji come from the existing data.

## Files
- `Recipe Card.dc.html`: the design: computer (left) and phone (right), fully interactive.
- `support.js`: the runtime that renders the HTML reference. It isn't part of the app.
- `Meal pricing.md`: the pricing rules.
