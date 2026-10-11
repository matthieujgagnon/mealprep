# Handoff: "Proteins on sale" card (Home), Riso v2

## Overview
One card on the Home page of The Matt Mo Cookbook (repo `matthieujgagnon/mealprep`, `client/src`): **Proteins on sale**. It lists protein categories (chicken, seafood, fish, beef, pork, tofu, turkey, lamb) with the best flyer price for each. Tapping a row opens a pop-out under it with every product on sale in that category, as cards. Tapping a product card opens a small detail strip (regular price, end date, Quebec average) with "Add to list" and "See in Flyers". Quebec French first, English second.

Scope: **only this card and what is inside it**. The rest of Home (greeting, Tonight, groceries, week strip, Use it up) is in the prototype file for context but is out of scope.

## About the design files
Files here are **design references created in HTML**: prototypes of the intended look and behaviour, not production code. Recreate them in the existing React app (components in `client/src/components`, styles in `client/src/index.css` under `.riso-theme`, strings via `t()` in `i18n/en.js` and `fr.js`). Do not copy the HTML or its inline styles. Use the app's real flyer data for prices, stores, end dates and sale percentages; this handoff changes layout, look and interaction.

## Fidelity
**High fidelity.** Match colours, type, spacing, borders, hard shadows and interactions. Use the app's `riso-*` classes and tokens where they exist.

## How to open the prototype
Open `page-home-desktop.dc.html` from this folder (needs `support.js`). Scroll to "Proteins on sale" (bottom left, beside "Use it up") and tap a row. Resize below 768px for the phone layout. Everything lives in this one file; the card is the `<section aria-label="Proteins on sale">` and its logic is in `renderVals()` (`P8`, `DEALS`, `proteins`). `part-header` and `part-copy.js` are only needed so the page loads (header and FR/EN strings).

## Card (collapsed)
- Position: bottom row of Home, left column. Desktop grid `minmax(0,1.7fr) minmax(0,1fr)` (card + "Use it up"), gap 20. Phone: single column.
- Shell: `#FFFDF8` (turns `#F4F1EA` while a row is open), 2px ink `#16181F` border, radius 22, padding 22, column flex. z-index 1 (25 while open so it sits above the scrim).
- Header row (baseline aligned, space-between, margin-bottom 14): `<h3>` "Protéines en rabais" / "Proteins on sale", Bricolage Grotesque 800 22px; link "Circulaires →" / "Flyers →" (700 13px, `#2323FF`).
- Row list: grid, 1 column (2 columns when the viewport is 1560px or wider), column gap 28, row gap 12. Eight rows in this order: chicken, seafood, fish, beef, pork, tofu, turkey, lamb.
- A bottom spacer (`flex:1`, min 14px) keeps the card stretched to the height of "Use it up".

### Row (header of a category)
- Box: padding 10px 12px, 2px ink border, radius 14, background `#FFFDF8`, height 78, contents vertically centred, cursor pointer.
- Inner grid: `30px | minmax(0,1fr) | auto | 38px`, column gap 18, items centred.
  1. Emoji, 22px, 28px wide, centred (🍗 🦐 🐟 🥩 🐖 ▢ 🦃 🐑).
  2. Name (Bricolage 14.5px / 1.15, no wrap) over a count line "4 PRODUITS" / "4 PRODUCTS" (DM Mono 500 10.5px, letter-spacing .06em, uppercase, `#5E5B52`, margin-top 3). The long meta line (store + "50% off the regular price · +8 more") exists in the data but is **hidden** (`display:none`).
  3. Right column (right-aligned, gap 3): best price (Bricolage 800 18px, e.g. `$7.92` with a DM Mono 500 11px unit `/lb`; FR `7,92 $`), optional green pill "Meilleure aubaine" / "Best deal" (`#10C95C`, 1.5px ink border, padding 0 8px, 800 11px; only on Pork), and a verdict caps line (DM Mono 500 10px, uppercase, letter-spacing .04em): "Faire des réserves" / "Stock up" (green `#16A34A`), "Acheter" / "Buy" (green), "Difficile à dire" / "Can't tell yet" (`#5E5B52`). Pork shows no verdict text (its "best" state shows the pill instead).
  4. Chevron button: 38px circle, 2px ink border, `#FFFDF8` fill, 800 17px "▾". Open state: ink `#16181F` fill, white "▴".
- Whole row toggles open/closed on click. Only one row open at a time.

## Pop-out (row open)
Behaviour on open:
- A transparent full-screen layer (fixed, inset 0, z 20) sits behind the card; clicking it closes the pop-out and the detail strip.
- Every **other** row is blurred 3px and set to .55 opacity (transition .15s).
- The open row keeps full opacity, gets `z-index:31`, its bottom corners square off (radius `16px 16px 0 0`) and the chevron inverts.
- The pop-out panel is absolutely positioned directly under the row: `top:100%`, `left:-2px`, width `calc(100% + 4px)`, `z-index:30`, max-height 60vh (scrolls), `#FFFDF8`, 2px ink border, bottom corners rounded (matches the row; see source for the exact radius), **hard shadow `5px 5px 0 #2323FF`** (blue), padding 8px 14px 10px, column flex.
- Because the panel overlays the rows below, the page height does not change.

### Product cards inside the pop-out
- Grid: `repeat(N, minmax(0,1fr))`, gap 12, padding 8px 0. **N = 3 on desktop, 2 on phone (<768px).** (A 4-column version was tried and reverted; keep 3.)
- Card: column flex, 2px ink border, radius 16, overflow hidden, cursor pointer, `#FFFDF8` (turns `#F4F1EA` while its detail strip is open). **The first card of each category (best price) carries a green hard shadow `5px 5px 0 #10C95C`**; the others none.
- Photo area: height 96px (84px phone), 2px ink bottom border, centred category emoji at 30px, striped placeholder `repeating-linear-gradient(135deg, #E9E4D8 0 10px, #DDD6C6 10px 20px)`. **Replace with real product photos if available.**
- Body: padding 9px 11px 11px, gap 2, `flex:1`:
  - Name: Bricolage 800 13.5px / 1.2, min-height 32 (2 lines reserved).
  - Store: Bricolage 600 12px, `#5E5B52` ("Super C", "Metro", "Maxi", "IGA").
  - Bottom row (margin-top 4, space-between, wraps): price (800 18px / 1.2 + DM Mono 500 11px unit) and a sale pill (`#10C95C`, 1.5px ink border, padding 0 8px, 800 11.5px / 20px, text "50% off" / "50 % de rabais").
- Cards are ordered best deal first.

### Product detail strip (card tapped)
Appears below the grid, inside the same pop-out: margin 0 0 6px, padding 12px 14px, 1.5px dashed `#BDB6A6` border, radius 16, `#F4F1EA`, gap 10.
- Title: "{product} · {store}" (Bricolage 800 14px).
- Three columns (equal, gap 8), each a caps label (DM Mono 500 9.5px, letter-spacing .1em, `#5E5B52`) over a value (Bricolage 700 13px): **REG. PRICE / PRIX COURANT** (sale price / (1 - discount)), **ENDS / SE TERMINE** (Wednesday, Thursday, tomorrow, cycled; sample), **QC AVERAGE / MOYENNE QC** (green `#00753F`: "−{discount − 5}%" when discount >= 25, else "near average" / "près de la moyenne").
- Buttons (gap 8, wrap, 32px high, radius 16, 2px ink border, 800 12px): **"+ Ajouter à la liste" / "+ Add to list"** (`#FFE14D`; after tapping: `#10C95C` "✓ Sur la liste" / "✓ On list"; it adds only, no un-add in the prototype) and **"Voir dans Circulaires →" / "See in Flyers →"** (`#FFFDF8`, blue `#2323FF` text, shadow `3px 3px 0 #16181F`, link to the Flyers page with the product and store as query params; use the app's route).
- Tapping the same product card again closes the strip; tapping another card switches it.

## Phone (<768px)
Same card, single column of rows, pop-out with 2 product cards per row and 84px photos. Full-width card inside page padding 18px.

## State
- `sel`: open category id (`null` | `chicken` | ...). Toggled by a row; cleared by the outside layer.
- `deal`: open product key `"category:index"` (cleared when `sel` changes).
- `listed`: map of product keys added to the grocery list.
- Language comes from the shared copy module (FR default). Container width < 768 switches to phone.

## Data (sample; wire to real flyers)
Each category: id, emoji, label, best product, store, extra count ("+8 more"), best price, unit, verdict (`stock` | `buy` | `tell` | `best`). Each product: name, store, price, unit, discount %. Counts shown in rows come from the number of products. Sample products: chicken 4, seafood 3, fish 3, beef 3, pork 3, tofu 1, turkey 1, lamb 1 (see `DEALS` in the file; the extra third deals for seafood, fish, beef and pork were invented to fill a 3-wide row). Prices are `$7.92` EN, `7,92 $` FR; units `/lb`, `ea` / `ch.`.

## Behaviour summary
- One pop-out at a time; outside click closes it.
- Blur and dim on non-selected rows prevent mis-taps.
- No loading, empty or error states are drawn (e.g. no flyer data, a category with zero sales).
- Not drawn: keyboard and focus handling; add it (rows are buttons, Esc closes, focus returns to the row).

## Design tokens
| Token | Value |
| --- | --- |
| Canvas / Surface / Track | `#F4F1EA` / `#FFFDF8` / `#E9E4D8` (placeholder stripe `#DDD6C6`) |
| Ink / Muted | `#16181F` / `#5E5B52` |
| Dash | `#BDB6A6` |
| Blue (links, pop-out shadow) | `#2323FF` |
| Green (sale, best deal) | `#10C95C`; text `#00753F`; verdict `#16A34A` |
| Yellow (add to list) | `#FFE14D` |
| Hard shadows | pop-out `5px 5px 0 #2323FF`; best product `5px 5px 0 #10C95C`; Flyers button `3px 3px 0 ink` |
| Radii | card 22; row 14 (top 16 when open); product card 16; detail strip 16; pills 30; chevron 50% |
| Borders | 2px ink on card, rows, product cards, buttons; 1.5px on pills; dashed `#BDB6A6` on detail strip |
| Fonts | Bricolage Grotesque 600 to 800 (UI, names, prices); DM Mono 500 (captions, units, uppercase, letter-spacing .04 to .1em, 9.5 to 11px) |

## Copy
Keys in `part-copy.js` (`home` block, FR and EN): `proteins`, `flyersLink`, `bestDeal`, `stockUp`, `buy`, `cantTell`, `offReg`, `underQc`, `more`, `ea`. Product names, category labels, "PRODUITS EN RABAIS", "PRIX COURANT / SE TERMINE / MOYENNE QC", and the add-to-list and Flyers button labels are written inline in the page; move them into `t()`. Some FR strings are guesses and need the app's real wording.

## Assets
No images. Category emoji and a striped placeholder for product photos. Product photos are an open item.

## Files in this folder
- `page-home-desktop.dc.html` the prototype (card markup and logic)
- `part-header.dc.html`, `part-copy.js`, `support.js` loaded by the prototype (not part of this card)
