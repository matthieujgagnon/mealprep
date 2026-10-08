# Handoff: Recipes and Makeable cards

## Overview
Two recipe cards with one visual language: photo-led, centered title over a dark gradient, Bricolage Grotesque and DM Mono only.
1. **Recipes card** (Recipes page grid): photo, meal, protein, time, title.
2. **Makeable card** (Makeable page): the same photo plus a white panel with what is missing, what expires soon, sale info, actions and ingredient progress. Desktop and phone versions.

The pages around the cards (title, search, filter chips, grid) are included for context only. The card specs below follow `card-makeable-desktop` and `card-makeable-mobile`. Inside `page-makeable-test` the same card is a little more compact (pills 32px high, tighter gaps, buttons 30px) because it is a denser desktop grid.

## About the Design Files
The HTML files are **design references**: prototypes of the intended look and behavior, not production code. Recreate them in the target codebase (React, Vue, SwiftUI, native, etc.) with its own components and patterns. Open any `.dc.html` in a browser; `support.js`, `part-header.dc.html`, `part-copy.js` and `part-finder-data.js` must stay beside them. Sample recipes, prices, expiry days and photos (Unsplash) are placeholders.

## Fidelity
High-fidelity. Colors, type, spacing and interactions are final.

## Files
- `page-recipes-test-final.dc.html`: Recipes page with the Recipes card (8 sample recipes).
- `page-makeable-test.dc.html`: Makeable page, full page: filters, three sections, cards, sale card, recipe pop-out.
- `card-makeable-desktop.dc.html`: the Makeable card alone, four states, plus the sale card.
- `card-makeable-mobile.dc.html`: the Makeable card on a 390px phone, sticky category chips.
- `part-header.dc.html`, `part-copy.js`, `part-finder-data.js`, `support.js`: shared header, French/English copy, sample data, prototype runtime.

# Part 1: Recipes card (`page-recipes-test-final.dc.html`)

## Page frame
Background `#F4F1EA`, content max 1280, centered; shared header (active "recipes"). Padding `8px 40px 64px`, gap 22. Title "Recettes" / "Recipes" (Bricolage Grotesque 800, 60px / .95, letter-spacing -.035em). Search field: height 52, radius 30, border 2px `#16181F`, bg `#FFFDF8`, shadow `5px 5px 0 #16181F`, 16px/500 placeholder `#8A8677`. Chip row (gap 8): Tout (selected: bg `#16181F`, text `#F4F1EA`, shadow `2px 2px 0 #2323FF`), Rapide, Repas ▾, Protéine ▾ (height 36, radius 22, border 2px, 13.5px/700, padding `0 16px`). Count line: DM Mono 500 11px, letter-spacing .12em. There is no "Expiring soon" chip.

## Grid
`repeat(auto-fill, minmax(min(100%, 240px), 1fr))`, gap 28, padding `10px 6px 0` (room for the shadow). All cards are the same size.

## Card
- Aspect ratio 3 / 4, radius 20, border 2px `#16181F`, shadow `0 10px 24px -6px rgba(22,24,31,.35), 0 2px 6px rgba(22,24,31,.15)`, overflow hidden, pointer cursor. Full-bleed photo (cover, fallback `#E9E4D8`).
- Top scrim: `linear-gradient(to bottom, rgba(22,24,31,.45), transparent 22%)`.
- Caption (top 14px, left/right 16px, flex, space-between, DM Mono 500 10.5px, letter-spacing .1em, `#FFFDF8`). Left, stacked with gap 3: meal word uppercase in weight 600 (`SOUPER`, `DÎNER`, `DÉJEUNER`), then the protein uppercase at 65% opacity when the recipe has one (`POULET`, `BŒUF`). Right: time uppercase (`35 MIN`, `4 H`).
- Title area: absolute, bottom 0, full width, height 46%, padding `0 18px 18px`, content at the bottom, `linear-gradient(to top, rgba(14,16,22,.9) 0%, rgba(14,16,22,.64) 38%, transparent 100%)`. Title: Bricolage Grotesque 700, 20px / 1.12, centered, white, text-shadow `0 1px 8px rgba(0,0,0,.45)`, max 2 lines, `text-wrap: balance`, sentence case as written.
- Meal line at the very bottom: left 25%, right 25%, height 2px, radius `2px 2px 0 0`, opacity .55. Colors: supper `#2323FF`, lunch `#FF48B0`, breakfast `#FFE14D`.

Sample recipes: Bols de shawarma au poulet (souper, poulet, 35 min), Orzo au citron et au poulet (souper, poulet, 30), Salade de pois chiches au tzatziki (dîner, 15), Soupe de haricots noirs à la mijoteuse (souper, 4 h), Shakshuka (déjeuner, 25), Pho au bœuf à la cocotte (souper, bœuf, 45), Crêpes au babeurre (déjeuner, 30), Bol déesse verte (dîner, 15).

# Part 2: Makeable card

## Overview
The recipe card for the Makeable page, shown in four states on one canvas (`card-makeable-desktop.dc.html`): ready, one or two short, needs a shop, and one short with an expiring ingredient. Everything on the card is covered: photo, title, use-soon strip, missing-ingredient pills, check circles, sale marks and the sale card, buttons, sale summary and the ingredient progress bar.

## The card
Width 330px in the workbench (fluid in a grid). Radius 20, border 2px (`#3DC97D` when ready, otherwise `#16181F`), bg `#FFFDF8`, overflow hidden, shadow `0 10px 24px -6px rgba(22,24,31,.35), 0 2px 6px rgba(22,24,31,.15)`. Cards keep their natural height (no stretching to match neighbors).

### 1. Photo (height 260)
- Cover image, fallback `#E9E4D8`.
- Top scrim: `linear-gradient(to bottom, rgba(22,24,31,.7), transparent 30%)`.
- Caption, top 14px / left 16px / right 16px: `MEAL · TIME`, e.g. `DÎNER · 25 MIN`. DM Mono 600 11px, letter-spacing .1em, `#FFFDF8`, text-shadow `0 1px 6px rgba(0,0,0,.6)`, no wrap.
- Bottom scrim: height 52%, `linear-gradient(to top, rgba(14,16,22,.9) 0%, rgba(14,16,22,.64) 40%, transparent 100%)`, content aligned to the bottom, padding `0 16px 14px`.
- Title: Bricolage Grotesque 700, 20px / 1.12, centered, white, text-shadow `0 1px 8px rgba(0,0,0,.45)`, `text-wrap: balance`, max 3 lines.

### 2. Use-soon strip (only when an ingredient expires soon)
Full width under the photo. bg `#FFF0F8`, border-top 2px `#16181F`, padding `9px 14px`, one line, gap 8, Bricolage Grotesque 600 12px `#5E5B52`. Contents: 8px dot `#F560B6`, emoji 14px, ingredient name (700, `#16181F`), then "expire dans N jours" / "expires in N days" (singular "jour/day" for 1). Days are written out, never "2 j".

### 3. White panel
Padding `14px 14px 40px`, flex column, gap 12. Border-top: 1.5px `#F5C6E0` when the strip is shown, otherwise 2px `#16181F`.

**To-buy block** (omitted when nothing is missing; ready cards show no "nothing to buy" text, the green border and the `COMPLET` caption carry that state; the panel then pulls up by 12px so the empty block leaves no gap).
- Caption `À ACHETER` / `TO BUY`: DM Mono 500 10px, letter-spacing .1em, `#5E5B52`; gap 8 above the pills.
- Two equal columns (`minmax(0,1fr)`, gap `6px 10px`). **Proteins in the left column, other ingredients in the right.** When the recipe has no protein, all pills go in the left column and the right column stays empty (single column, same pill size).
- Pills stack with gap 9.
- Pill: height 34, radius 17, border 1.5px `#E4DED0`, bg `#FFFDF8`, padding `0 10px 0 6px`, gap 6, Bricolage Grotesque 700, no wrap. Contents: check circle, emoji (15px), lowercase name, and a sale mark when the ingredient is on sale.
- Pill font size by name length: 13px up to 7 characters, 12px at 8, 10.5px at 9 or more (e.g. "gingembre", "anis étoilé"). Set per pill.
- Check circle: 20px, border 1.5px `#D5CEBF`, bg `#FFFDF8`; added = bg `#3DC97D` with "✓" (800 10px). Tapping adds or removes that single ingredient from the grocery list.
- Sale mark: 18px circle, "%" 800 10px, border 1.5px `#3DC97D`, bg `#FFFDF8` (`#3DC97D` while its sale card is open). Tapping opens the sale card.

**Footer** (`margin-top: auto`, gap 10): "4 portions" / "Serves 4" (500 11.5px `#8A8677`), then the button row (flex, wrap, gap 6, centered).
- Button: height 30, radius 15, border 2px `#16181F`, padding `0 14px`, 12px/700, no wrap. Primary: bg `#2323FF`, white text. Secondary: bg `#FFFDF8`, text `#16181F`. Done: bg `#3DC97D`, text `#16181F`.
- Buttons change with the situation:
  - **Ready**: *Cuisiner* (primary) + *Planifier* (secondary).
  - **One or two short**: *À acheter* (primary) + *Planifier*. *À acheter* adds all missing items; it becomes "✓ Ajouté" (green) and an underlined *Annuler* link appears.
  - **Needs a shop**: *Planifier* (primary) first, then *À acheter* (secondary, same add/undo). Cooking is not offered because the recipe cannot be made yet.
- Sale summary at the right end of the row (`margin-left: auto`) when any missing ingredient is on sale: 16px green `#3DC97D` "%" dot (9px/800) and "N en rabais" / "N on sale" (600 11.5px `#5E5B52`).

**Ingredient progress** (pinned to the panel bottom)
- Caption row at bottom 11px, left/right 14px, DM Mono 500 10px, letter-spacing .1em, `#3F3E37`. Left: `have/total INGRÉDIENTS`. Right: `COMPLET`, or `N MANQUANTS` (`N MANQUANT` for 1; English `N MISSING` / `COMPLETE`).
- Bar flush with the card's bottom edge: height 4px, track `#EFEBE0`, fill `#8F8FFF`, width = have ÷ total.

## Sale card (opens from a pill's "%")
Centered modal. Backdrop `rgba(22,24,31,.45)` with 4px blur; click outside or × closes. Card width `min(340px, 100%)`, border 2px `#16181F`, radius 24, bg `#FFFDF8`, shadow `8px 8px 0 #16181F`.
- Header (padding `16px 16px 12px`, gap 12): 44px emoji tile (border 2px, radius 14, bg `#F4F1EA`); caption `EN RABAIS` / `ON SALE` (DM Mono 500 10px, `#1E9E57`); ingredient name 22px/800 capitalized; 32px circular × button.
- Deal panel (margin `0 16px`, padding `14px 16px`, radius 16, bg `#E4F6EA`, border 2px): percent 34px/800 (e.g. `−40 %`), price 20px/800, regular price 12px/500 `#5E5B52` struck through. Regular price = price ÷ (1 − percent).
- Store row (padding `14px 16px 4px`): `MAGASIN` / `STORE` caption left, store name 15px/800 right.
- Button (padding `12px 16px 16px`): full width, height 44, radius 22, border 2px, shadow `3px 3px 0 #16181F`, 14.5px/800. "Ajouter à la liste" (bg `#2323FF`, white). When added: bg `#3DC97D`, dark text, "✓ Ajouté · Annuler" (tap again to remove).

## State
- `listed`: map `recipeId:ingredientIndex` → true (the grocery list). `saleKey`: the open sale card.
- "À acheter" adds every missing ingredient of that card. The button reads "✓ Ajouté" only when all are added.
- Ready = 0 missing, one or two short = 1–2 missing, needs a shop = 3 or more.
- French and English via the `lang` prop (default `fr`).

## Design tokens
- Ink `#16181F`; card `#FFFDF8`; page `#F4F1EA`; canvas `#E9E4D8`; muted text `#5E5B52`, `#8A8677`, `#3F3E37`.
- Blue `#2323FF`; green `#3DC97D` (text `#1E9E57`, tint `#E4F6EA`); pink `#F560B6` (tint `#FFF0F8`, border `#F5C6E0`); progress `#8F8FFF` on `#EFEBE0`.
- Pill border `#E4DED0`; check-circle border `#D5CEBF`.
- Fonts: Bricolage Grotesque (500–800) for all UI and card titles, DM Mono 500/600 for captions. No other fonts.
- Radii: card 20, pill 17, button 15, modal 24, panel 16.

## Sample states in the workbench
1. **Ready now**: Salade de pois chiches au tzatziki, 5/5, strip "Céleri expire dans 2 jours".
2. **One or two short**: Orzo au citron et au poulet, 4/6, missing parmesan and citron (both on sale), strip for épinards.
3. **Needs a shop**: Pho au bœuf à la cocotte, 2/6, missing bœuf (protein, left column) plus nouilles, gingembre, anis étoilé (right column); no strip.
4. **One short, expiring**: Shakshuka, 5/6, missing feta (on sale), strip for oignon.

## Phone version (`card-makeable-mobile.dc.html`)
Same card, same data and behavior, in a 390 x 844 phone frame (border 2px `#16181F`, radius 36, shadow `8px 8px 0 #16181F`). The frame is only a presentation device; implement the screen content.

**Screen**: scrolling column, padding `56px 16px 32px` (top clears the status bar), gap 18.
- Title "Faisable" / "Makeable": Bricolage Grotesque 800, 38px / .95, letter-spacing -.035em.
- Search field: height 48, radius 26, border 2px, bg `#FFFDF8`, shadow `4px 4px 0 #16181F`, 15px/500 placeholder `#8A8677`, one line with ellipsis.
- Filter chips in a horizontally scrolling row (gap 8, bleeds to the screen edges): Tout, Faisable maintenant, 1 ou 2 articles, Rapide. Height 40, padding `0 16px`, radius 22, border 2px, 13.5px/700, 9px color dot (white, green `#3DC97D`, yellow `#FFE14D`, white). "Tout" is selected: bg `#16181F`, text `#F4F1EA`. The chip row is sticky: it pins just below the status bar (44px from the top) while the cards scroll, on a `#F4F1EA` background that also covers the status-bar strip.
- Cards stacked in one column at full width (358px), gap 18. The state label above each card in the workbench is removed.

**Card changes for touch** (everything else matches the card above):
- Pills: height 40, radius 20, padding `0 12px 0 8px`; check circle 26px (✓ 12px); sale mark 24px ("%" 12px). Pill font sizes by name length are unchanged (13 / 12 / 10.5px).
- Buttons: height 44, radius 22, padding `0 20px`, 14px/700. "Annuler" link 13.5px/700 with `10px 4px` padding for a larger tap area. The sale summary stays at the right end of the button row and wraps below the buttons when there is no room.
- Sale card and pop-ups open inside the phone frame (absolute, not fixed), with the same styling as above.

Targets: every tappable element is at least 40px high (44px for buttons).

