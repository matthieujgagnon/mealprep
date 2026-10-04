# Handoff: Grocery list item (all views), Riso Poster

## Overview
One grocery item design used in every grocery view of The Matt Mo Cookbook, in Quebec French. The same anatomy and the same parts appear in the Par magasin, Par rayon and Par recette lists and in Mode épicerie. Only the container, the row height and a few sizes change.

The main deliverable is the **grocery page** in desktop (1280 px) and phone (390 px): `Riso Grocery Responsive.dc.html`. `Riso Grocery Item.dc.html` shows the item in its other forms: tiles, phone rows, Store mode, and the brand cases.

## About the design files
The `.dc.html` files are **design references built in HTML**: prototypes of the intended look and behaviour, not production code. Recreate them in the app's existing stack and patterns (keep the current backend, data model and logic). `support.js` is only the prototype runtime; open any file in a browser with it next to the file.

Styling is inline in the prototypes. In the real app, put every colour, size and radius below into the existing Riso Poster tokens (CSS custom properties) rather than hard-coding hex values.

## Fidelity
**High-fidelity.** Match colours, type, borders, spacing, copy and states. The approved design system is the Riso Poster system described in `design_handoff_riso/README.md`; this package only adds the grocery item.

## Files
- `Riso Grocery Responsive.dc.html`: **main reference.** The grocery page, desktop and phone, using the `line` form of the item.
- `GroceryItem.dc.html`: the item component. Props: `item`, `variant` (`line`, `tag`, `row`, `store`), `hover`, `flip`, `height`. All sizes and states are computed in its logic block; read it for exact values.
- `Riso Grocery Item.dc.html`: the item as tiles (desktop grid), phone rows (Par rayon, Par recette), Store mode, and the "Avec une marque" row.
- `support.js`: prototype runtime.

## Item anatomy
Every item has the same parts in the same order. Left to right in a row:

1. **Checkbox.** 30 px visual (17 px tick), inside a 44 × 44 tap area. The only thing that checks the item (except in Store mode). 2px ink border, radius 9, `--card` fill. Checked: `--blue` fill, white ✓.
2. **Text column** (grows):
   - **Name**, alone on its line. Bricolage Grotesque 800, 15.5px/19px, letter-spacing −.01em. Wraps; never cut. Checked: `--ink-muted` colour and line-through.
   - **Meta line** below (wraps to more lines when narrow, gap 4px 10px, only rendered if there is something to show):
     1. **Brand**: Bricolage 600 12.5px, `--ink`. If there are also recipes, a 4px `--ink-muted` dot follows it.
     2. **Recipes**: DM Mono 500 11px, uppercase, letter-spacing .06em, `--ink-soft`. Example `TACOS, CHILI`, `SANDWICH +2` (names, then +n for the rest).
     3. **Recipe quantity** (phone only, in the meta line): dashed chip, 20px tall, DM Mono 500 10.5px, `1.5px dashed #8A877D`, radius 10. Example `350 g`.
     4. **Deal tag** (only when on sale and not checked): `--green` fill, 1.5px ink border, radius 6, 22px tall, padding 0 8px. Contents: store (Bricolage 600 11.5px), a 1.5px ink divider, price (DM Mono 700 11.5px). Example `Metro | 2,49 $`. Ink text on green.
3. **Right cluster** (desktop order, left to right):
   - **+ Inventaire** button, **only when the item is checked**. 30px tall pill, `--blue` fill, white Bricolage 700 12.5px text, 2px ink border, 2px 2px 0 ink shadow, padding 0 12px. 44 px tall tap area. Sends the item to Inventory. Not rendered when unchecked, so no placeholder.
   - **Recipe quantity** (desktop only): dashed pill, 26px tall, DM Mono 500 12px, `1.5px dashed #8A877D`, padding 0 10px, margin 0 6px. This is what the recipes need in total and is the only place that carries units: `3 boîtes`, `350 g`, `750 mL`. Hidden for manual items (no recipes).
   - **Item quantity**: an editable text input styled as a pill. 26px tall, 78 px wide (60 px on phone), DM Mono 700 13px, centred, 1.5px ink border, `--track` fill (transparent when checked). Focus: border `--blue` and `2px 2px 0 --blue`. **A plain number only, never units** (`1`, `3`). This is how many to buy.
   - **Remove ×**: 30px circle (same size as the checkbox), 2px `--ink-muted` border and glyph (Bricolage 600 18px), 44 × 44 tap area. Hover: ink fill, paper glyph. Always visible.
4. The right cluster has a fixed width (82 px column on desktop, 64 px on phone) so quantities and × line up row to row.

Manual item: name and quantity only, nothing else.

## Forms of the item
All items in one view are the same height.

| form | where | height | notes |
|---|---|---|---|
| `line` | grocery page, desktop | 68 | full-width row, no border or radius, dashed divider above each row (`1.5px dashed #D6CFBF`), padding 0 10px 0 14px. Hover: `--paper` background. Checked: `--paper` background. Name clamp 2 lines. |
| `line` + `height` | grocery page, phone | 108 | same as above; recipe quantity moves into the meta line; name clamp 4 lines; padding 0 10px 0 14px |
| `tag` | grocery tile grid (desktop, 3 columns, gap 16, tiles 389 × 84) | 84 | card: 2px ink border, radius 18, `--card` fill. Hover: translate(−2px,−2px) and `4px 4px 0 --blue` shadow. Checked: `--track` fill. No inventory button, static quantity. |
| `row` | phone cards | 96 | as `tag` without hover; name clamp 3 |
| `store` | Mode épicerie | 120 | dark screen (`--ink`), paper rows radius 22; checkbox 40 px (56 tap), name 19px/23px, brand 14px, deal tag 28 px tall (13px text), quantity static (DM Mono 700 15px). **The whole row checks it.** No ×, no inventory button. Checked: fill `#2A2D38`, paper text, green `#10C95C` box with ink ✓. |

## Grocery page (desktop 1280 px)
- Container max-width 1280, padding 28px 40px 56px, gap 24.
- **Header**: logo "matt mo **cookbook**" (800 28px, "cookbook" on pink, radius 6, padding 0 8px); nav Accueil, Recettes, Planificateur, Faisable, **Épicerie** (active: blue pill, 2px border, 3px shadow), Circulaires, Inventaire; **FR / EN** switch (2px outlined pill, active segment ink fill) and a 44px yellow avatar circle "M".
- **Title row**: label (DM Mono 500 12px, .12em) `n À ACHETER · k EN RABAIS`; title "Liste d'**épicerie.**" 800 60px/.95, letter-spacing −.035em, last word `--blue`. Segmented control **Par magasin / Par rayon / Par recette** (40px, active ink fill) and **Partager** (44px outlined pill).
- **Two columns**, gap 22: main (flex 1) and a 300px sticky side panel.
- **Add field**: a pill, 2px border, `--card`, padding 6px 6px 6px 22px, placeholder "Ajouter un item, p. ex. 2 citrons", with a blue **Ajouter** button (40px, 3px-radius-less pill, 2px shadow). Parse the quantity and the name as in the existing page.
- **Store group card**: `--card`, 2px ink border, radius 24, overflow hidden.
  - Header band `--track`, padding 10px 14px 10px 18px, 2px ink bottom border: a 2 × 3 dot drag handle, store name (800 22px), count `n À ACHETER · k EN RABAIS` (DM Mono 500 11px), and a 40px outlined round × (remove the group).
  - Below it, one `line` item per row.
- **Side panel "Dans le panier"** (pink): `--pink`, 2px border, radius 24, 6px hard shadow, padding 20. Label DM Mono; the number of checked items in 800 84px; "item coché / items cochés"; 14px progress bar (paper track, ink fill); an ink button **Terminé · ajouter n à l'inventaire** (min 44px, radius 22); copy "Vous confirmez chaque item coché, avec son rayon et une date limite USDA, avant son envoi à l'inventaire."
- The green "On sale" panel from the existing page is not part of this design and is unchanged.

## Grocery page (phone 390 px)
- Fixed top block with a 2px bottom border: logo (800 21px) with FR/EN and a 36px avatar; below it a horizontally scrolling row of 40px pill buttons (Accueil … Circulaires), active **Épicerie** in blue with a 3px shadow, scrollbar hidden.
- Content, padding 18px 16px, gap 16: label, title 800 38px/.95, a full-width segmented control **Magasin / Rayon / Recette** (44px), the add field (5px padding, 40px button), then the group card (radius 22, header 8px 10px 8px 14px, name 800 20px, count DM Mono 10.5px, a 32px round × in a 44px tap area), with `line` items at height 108.
- Sticky pink button at the bottom (left and right 16, bottom 18, 56px, radius 28, 2px border, 4px shadow): **Je suis à l'épicerie** plus DM Mono 11px `MODE GRAND`. It opens Mode épicerie. Leave about 110px of bottom padding on the list so the last row scrolls clear of it.
- No inventory button in the cart panel on phone; the **+ Inventaire** button on each checked row sends that item, and Mode épicerie ends with the green button below.

## Mode épicerie (phone)
- Screen `--ink`, paper text. Header: **← Liste** (44px outlined pill), store switcher (Metro, Super C, Maxi; active segment paper fill), the count of items left in pink 800 60px with "à prendre chez Metro" and a 14px green progress bar.
- List: `store` items, gap 8, padding 4px 14px 14px. Checked rows move to the bottom.
- Footer: green button **Terminé · n à l'inventaire** (60px, radius 30, Bricolage 800 18px) that moves the checked items to Inventory with USDA dates.

## Interactions and behaviour
- **Check**: tapping the checkbox toggles it (tapping anywhere on the row in Mode épicerie). Checking hides the deal tag, strikes the name, greys the row and reveals **+ Inventaire**. Checked items move to the bottom of their group (the prototype keeps position for review).
- **+ Inventaire**: moves that item to Inventory using the USDA location and date, then removes it from the list. Confirm shelf and use-by date first, as the panel copy says.
- **Edit quantity**: the quantity field accepts a number only. Do not let units in. Units belong to the recipe quantity.
- **Remove ×**: removes the item. **Group ×** removes the store group's items; confirm first.
- **Hover** (desktop): `tag` lifts with a blue hard shadow, `line` takes a paper background, × fills ink.
- **Names are never cut.** Rows are one height per view, so size the row for the longest name (2 lines on desktop `line`, 4 on phone `line`). If a real name needs more, raise the row height for the whole view rather than cutting.
- **Segmented control** regroups the list: Par magasin, Par rayon, Par recette. The item looks the same in all of them.
- Store assignment, de-duplication and Inventory rules are unchanged from `design_handoff_riso/README.md`.

## Data per item
```
id, name, qty            // qty: number only, editable (how many to buy)
recipes: [{ name }]      // shown as "TACOS, CHILI", then "+n"
recipeQty                // string with unit, e.g. "350 g" (sum of what recipes need); absent for manual items
brand                    // optional, flyer items
deal: { store, price }   // optional, e.g. { "Metro", "2,49 $" }; only shown when not checked
checked                  // boolean
```
Sample items used in the design:
1. **Tomates en dés**: qty 3, recipes TACOS, CHILI, recipe quantity 3 boîtes, brand Unico, deal Metro | 2,49 $.
2. **Fromage cheddar fort vieilli, tranché mince**: qty 1, recipe quantity 350 g, recipes SANDWICH +2. (Long name.)
3. **Papier d'aluminium**: qty 1. (Manual item, nothing extra.)
4. **Lait 2 %**: qty 1, recipe quantity 750 mL, recipes CRÊPES. Checked.

## Design tokens (Riso Poster)
| token | hex | use here |
|---|---|---|
| `--paper` | `#F4F1EA` | page; row hover and checked row |
| `--card` | `#FFFDF8` | group card, tiles, inputs |
| `--ink` | `#16181F` | text, every outline and hard shadow |
| `--ink-soft` | `#3F3E37` | recipes text |
| `--ink-muted` | `#5E5B52` | checked name, × border and glyph |
| `--track` | `#E9E4D8` | group header band, quantity pill, checked tile |
| `--rule` | `#D6CFBF` | dashed row dividers |
| `--blue` | `#2323FF` | checked box, + Inventaire, focus, active nav |
| `--pink` | `#FF48B0` | logo highlight, cart panel, store-mode button |
| `--green` | `#10C95C` | deal tag, store-mode progress and checked box |
| `--yellow` | `#FFE14D` | avatar |
| dashed chip | `#8A877D` | recipe-quantity dashed border |
| store checked row | `#2A2D38` | Mode épicerie checked fill |

Type: Bricolage Grotesque (headings, names, buttons, deal store), DM Mono 500/700 (quantities, recipes, counts, prices), Inter (body copy only). Borders 2px ink (1.5px on small chips). Radii: 24 group card, 22 phone card and store rows, 18 tiles, 9 checkbox, 6 deal tag, pills = height ÷ 2. Hard shadows: 6px on the cart panel, 4px on the store-mode button, 2–3px on small buttons.

## Copy (Quebec French)
Liste d'épicerie, Par magasin, Par rayon, Par recette, Magasin, Rayon, Recette, Partager, Ajouter, Ajouter un item, p. ex. 2 citrons, À ACHETER, EN RABAIS, DANS LE PANIER, item coché / items cochés, Terminé · ajouter n à l'inventaire, + Inventaire, Je suis à l'épicerie, MODE GRAND, à prendre chez Metro, ← Liste.

## Assets
No images or icons. The × and ✓ are text glyphs. Fonts: Bricolage Grotesque, DM Mono, Inter (Google Fonts).
