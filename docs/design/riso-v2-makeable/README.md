# Handoff: Makeable page (desktop + phone), Riso v2

## Overview
The **Makeable** page of The Matt Mo Cookbook (repo `matthieujgagnon/mealprep`, `client/src`). It answers "What can I make?": every recipe is sorted by how much is missing from the user's inventory, so the user can cook now, buy one or two things, or plan a shop. From any tile the user can open the recipe, add missing items to the grocery list, find similar recipes, or plan the recipe. Quebec French first, English second.

Scope: **desktop (container >= 768px, max 1280px)** and **phone (container < 768px, designed at 390px)**. One component serves both; the layout switches on the container width, not the device.

## About the design files
The files here are **design references created in HTML**: prototypes of the intended look and behaviour, not production code. Recreate them in the existing React app (components in `client/src/components`, styles in `client/src/index.css` under `.riso-theme`, strings via `t()` in `i18n/en.js` and `fr.js`). Do not copy the HTML or its inline styles. Reuse the app's existing Makeable data and rules (inventory, missing-ingredient computation, flyer sales, grocery list API); this handoff changes layout, look and interaction, not the data model.

## Fidelity
**High fidelity.** Match colours, type, spacing, borders, hard shadows and interactions. Use the app's `riso-*` classes and tokens where they exist.

## How to open the prototype
- `compare-makeable.dc.html`: desktop and phone side by side (open this first).
- `page-makeable-desktop.dc.html`: the page. Resize the window below 768px to see the phone layout.
- `page-makeable-mobile.dc.html`: a 390px frame around the same page.

Open from this folder (needs `support.js`). Loading takes a few seconds. Note: both the desktop and phone previews load `page-makeable-desktop.dc.html`; there is no separate phone page.

Structure: `page-makeable-desktop` = `part-header` (active = `makeable`) + `part-planner-board` (`embedded`, `view="makeown"`), which renders the title and mounts **`part-finder`** (`ctx="makeable"`, `grouped="true"`). All of the Makeable UI lives in `part-finder`. `part-planner-board` also contains the Planner and Recipes views; **ignore those**, only the `makeown` branch, the toast and the full-recipe overlay matter here. `part-finder-sheet`, `page-recipes-desktop` and `part-plan-popup` are in the folder only because the board imports them; they are not part of this page.

## Page structure (top to bottom)
1. **Header** (`part-header`, `active="makeable"`): shared across pages, see the v2 main handoff. Desktop: padding 24px 40px, wordmark 28px, tabs 36px high. Phone: sticky, padding 8px 18px 0, 2px ink bottom border, wordmark 21px, tabs 40px high in a horizontally scrolling row.
2. **Title** `<h1>`: "Qu'est-ce que je peux **faire ?**" (EN "What can I **make?**"). Bricolage Grotesque 800, line-height .95, letter-spacing -.035em, accent word `#2323FF`. Desktop 60px, phone 40px.
3. **Finder** (search, filters, grouped results). Gap between title and finder 18px.
4. **Toast** (fixed, bottom centre).
5. Overlays: recipe pop-out (from a tile), per-tile grocery-list popover.

Page padding (embedded): desktop `8px 40px 56px`, phone `0 18px 40px`. Max width 1280, centred. Block gap: 22px desktop, 16px phone. Background `#F4F1EA`.

## Finder layout switch
| | Desktop (wide) | Phone (card) |
| --- | --- | --- |
| Search bar | label chip "RECHERCHE", 44px input, shadow `5px 5px 0 ink`, padding 6px 10px | no label chip, 38px input, no shadow, padding 4px 8px 4px 14px, placeholder "Chercher une recette" |
| Availability control | content-width segmented, 36px | full-width, 32px, segments share width equally, labels "Tout / Faisable / 1 ou 2" |
| Toggles | inline | full-width row, equal flex |
| Tile grid | 4 columns, gap 16 | 2 columns, gap 10 |
| Tile photo | 136px | 88px |
| Tile radius / name | 20 / 15px | 16 / 13px |
| Section title | 20px | 16px |
| Pop-out | 680px, two columns | 340px max, one column |

## Search bar
Pill, 2px ink border, `#FFFDF8`, radius 30. Input: Bricolage 500 16px (14.5px phone), placeholder "Titre, ingrédient ou étiquette" / "Title, ingredient or tag" (phone: "Chercher une recette" / "Search recipes"), colour of placeholder `#8A8677`. Round x (28px) clears. Matches title and ingredient names, case-insensitive.

**"With" strip** (always attached under the bar): `margin -8px 14px 0`, `#F4F1EA`, 2px dashed ink, no top border, radius `0 0 18px 18px`, padding 12px 14px. Caps "AVEC" / "WITH" (DM Mono 500 10.5px, .12em), one ink pill per picked ingredient (28px, ink fill, white text, shadow `3px 3px 0 #2323FF`, yellow x circle removes it), and a dashed pill "+ Ajouter un ingrédient ▾" / "+ Add an ingredient ▾" that opens the ingredient picker.

**Ingredient picker** (inline under the strip): `#FFFDF8`, 2px border, radius 16, shadow `5px 5px 0 ink`, padding 14. Caps "INGRÉDIENTS DE VOTRE CUISINE", blue-tint count pill (`#E8E9FF`, "2 choisis" / "2 picked"), 30px x to close, search input (38px pill, `#F4F1EA`, "Chercher un ingrédient"). Pink pill "Expire bientôt" / "Expiring soon" (`#FF48B0`, 24px) + caps help, then the expiring items (spinach 3 d, onion 4 d, celery 7 d; "3 j" / "3d"), a 1.5px dashed `#BDB6A6` rule, then shelf drawers in a grid (3 columns desktop, 1 phone, gap 10). Drawer: 2px border, radius 16; header = coloured name pill + count ("2/6" when picked) + 22px round +/- toggle; header fill `#F4F1EA` when open. Shelf colours: Fridge `#4DE3FF`, Freezer `#A56BFF`, Pantry `#EAE3CF`, Spice rack `#FFB86B`, Baking `#FFD0E8`. Ingredient chip: 28px, 1px ink border, emoji + name; picked = `#E8E9FF`, shadow `1.5px 1.5px 0 #2323FF`, 16px blue check circle. Typing in the picker search opens all drawers and filters chips.

Picked ingredients keep only recipes that use at least one, sorted by how many they use. Tiles then show "utilise poulet et citron" / "uses chicken and lemon" (11.5px, `#3F3E37`).

## Filter row
Wraps, gap 8px 14px.
- **Availability segmented control**: pill, 2px ink border, `#FFFDF8`, 2px inner gap. Segments: **Tout / Faisable maintenant / 1 ou 2 à acheter** (EN All / Makeable now / 1 or 2 to buy; phone: Tout / Faisable / 1 ou 2). Each has a 9px dot (white `#FFFDF8`, green `#10C95C`, yellow `#FFE14D`, 1.5px border) and a DM Mono 500 10px count at .75 opacity. Selected = ink fill, cream text `#F4F1EA`, dot border cream. Mutually exclusive: "ready" = nothing missing, "few" = 1 or 2 missing.
- **Toggle pills** (36px, radius 22, 2px border, 700 13.5px): **Expire bientôt** (pink `#FF48B0` dot) and **Rapide** (<= 30 min). Selected = ink fill, cream text, shadow `2px 2px 0 #2323FF`. Filters combine (AND).
- **Menu pills** **Repas** and **Protéine** with ▾, right-aligned on desktop. **Not interactive in the prototype**; build them like the Recipes page menus (`RisoControls.jsx`).
- **Show sales** toggle (EN "Show sales", FR "Montrer les rabais"): desktop = last pill after a 2px x 36px divider (ink at .25 opacity), green dot; phone = a third toggle in the toggle row. See Sales below.
- Counts in the segmented control reflect the current search and picked ingredients, before availability/toggle filters.

## Results
Count line: DM Mono 500 11px, letter-spacing .12em, "10 recettes" / "10 recipes" ("1 recette"). Then **sections** (empty sections are hidden):

| Order | Section | Title FR / EN | Description FR / EN | Count badge fill |
| --- | --- | --- | --- | --- |
| 1 | In your week (collapsible) | Repas de la semaine / Meals of the week | Déjà planifiées. Touchez une carte pour voir le jour. / Already planned. Open a card to see the day. | transparent, **blue** border `#2323FF` |
| 2 | Ready | Prêtes maintenant / Ready now | Vous avez tout : cuisinez maintenant. / You have everything: cook now. | green `#10C95C` |
| 3 | Few | À un ou deux articles / One or two short | Il manque 1 ou 2 articles à acheter. / One or two items to buy. | yellow `#FFE14D` |
| 4 | Shop | Il faut faire l'épicerie / Needs a shop | Il faut passer à l'épicerie. / Needs a trip to the store. | `#FFFDF8` |

Rules: recipes planned this week go **only** in section 1 (sorted by most missing first) and are removed from sections 2 to 4. Section 1 is **collapsed by default**; click the header to toggle (chevron rotates -90deg when closed; description and grid hidden). Sections 2 to 4 are not collapsible. Missing count: ready = 0, few = 1 or 2, shop = 3+.

Section header: row, gap 10: title (Bricolage 800 20px, 16px phone), count badge (min 28 x 26px, padding 0 9px, radius 13, 2px border, 800 12px), then a 2px ink line at .15 opacity filling the rest. Description below: Inter 500 13px `#3F3E37`. Gap between header, description and grid: 10px.

### Recipe tile
`#FFFDF8`, 2px ink border, radius 20 (16 phone), overflow hidden, column. Click opens the pop-out.
- **Photo** (136px, 88px phone, cover, `#E9E4D8` fallback, 2px ink bottom border). Time pill bottom-right 6px inset: `#FFE14D`, 1.5px border, padding 2px 10px, 800 11px, "⏱ 40 min".
- **Body** padding 10px 12px 12px (8px 9px 9px phone), gap 5: name (800 15px / 1.2, 2-line clamp; 13px phone); **have-bar** (8px high, radius 4, 1.5px ink border, `#E9E4D8` track, `#2323FF` fill = on-hand ingredients / total); **availability line** (600 11.5px / 1.3): ready = "Rien à acheter" / "Nothing to buy" in `#00753F`; otherwise **"Il manque : poulet, citron"** / "Missing: chicken, lemon" in `#3F3E37` (names joined by comma); optional "uses ..." line when ingredients are picked.
- **Actions row** (padding-top 4, gap 6; always shown on Makeable): **Recettes similaires** / "Similar recipes" (phone: "Similaires" / "Similar"), 28px, radius 14, 2px border, `#FFFDF8`, 700 12px; and, only when something is missing, **À acheter** / "To buy" (same size; background `#FFFDF8`; see Sales for green states).
- **Ready signal**: tiles with nothing missing carry shadow `5px 5px 0 #16181F`. While the pop-out or grocery popover is open for a tile, its shadow is `6px 6px 0`.

### Per-tile grocery popover ("À acheter")
Opens attached under the tile (tile bottom corners square, popover top edge dashed): width = tile, `#FFFDF8`, 2px border (top 2px dashed `#BDB6A6`), radius `0 0 18px 18px`, shadow `5px 5px 0`, padding 12px 14px 14px, gap 10, z 60. A cream (`rgba(244,241,234,.5)`, 4px blur) scrim covers the page; click it to close.
- Caps "AJOUTER À LA LISTE D'ÉPICERIE" / "ADD TO THE GROCERY LIST" (DM Mono 10px, `#5E5B52`).
- One row per missing ingredient: 34px emoji square (radius 10, 2px border, `#F4F1EA`; hidden on phone), name (700 13.5px) and, when sales are on and the item is on sale, a sale line (below), and a button **"+ Ajouter"** / "+ Add" (28px, radius 14, 2px border, 800 11.5px). Added state: green `#10C95C` fill, "✓ Ajouté" / "✓ Added"; tap again to remove.
- Footer, right-aligned: **"Tout ajouter · N"** / "Add all · N" (N = items not yet added) adds the rest and shows one toast.
- Each add shows the toast "N article(s) ajouté(s) à la liste d'épicerie." / "N item(s) added to the grocery list." (key `listed`).

### "On your list" strip
Appears inside a tile (below the actions) once any of its items was added **anywhere on the page**; it lists the unique items across all recipes: dashed top rule (1.5px `#BDB6A6`), caps "SUR VOTRE LISTE · 3" / "ON YOUR LIST · 3", removable chips (28px, 2px border, name + x), and a blue text link "Ouvrir la liste d'épicerie →" / "Open the grocery list →" (700 12.5px, `#2323FF`). Link shows toast `groceryMsg` in the prototype; navigate to Grocery in the app. In the prototype the added state lives in the finder; in the app it must reflect the real grocery list.

### Sales ("Show sales")
Off by default. When on, ingredients that are on sale in the flyers get: a green sale line in the popover row (pill `#10C95C`, 1.5px border, "−30 %" 800 10.5px, then "Maxi · 0,50 $/ch." 600 11.5px `#3F3E37`), and the tile's **À acheter** button turns green (`#10C95C` at .68 opacity when some missing items are on sale; full `#10C95C` when everything missing has been added). Sample sales: lemon Maxi 30%, cucumber Super C 33%, pita IGA 25%, parmesan Metro 40%, feta Super C 35%, beef Super C 50%, noodles Maxi 28%, ginger Metro 20%, avocado IGA 45%, mushrooms Maxi 38%. Wire to the real flyer data.

### Recipe pop-out (click a tile)
- **Desktop**: 680px wide, `#FFFDF8`, 2px border, radius 30, shadow `8px 8px 0 ink`, padding 18, centred in the viewport (min 16px margins). It grows out of the tile and returns on close: 0.35s `cubic-bezier(.2,.8,.2,1)`, scale .9 to 1, opacity (opacity .08s linear). The origin tile blurs 2px. The rest of the page gets a `rgba(22,24,31,.5)` scrim with 5px backdrop blur (click to close, .35s fade).
- **Phone**: no grow animation; popover 340px (max `100vw - 36px`), single column, photo 180px, same scrim.
- Header: name 800 26px / 1.08 (letter-spacing -.015em); under it a yellow time pill "⏱ 40 min | 4 portions" (26px, 1.5px border, `#FFE14D`, 1px divider) and a `#F4F1EA` meal chip ("Souper"); 34px round x top-right.
- Body: desktop grid `300px | 1fr` (gap 14 x 22): photo (270px high, radius 16, 2px border); right column: optional pink tag "Prévu mercredi" / "Planned Wednesday" (`#FF48B0`, ink text, 1.5px border, 800 12.5px) when the recipe is planned this week; caps "VOUS AVEZ · 5" with green chips (32px, `#E4F6EA`, 2px border, 20px `#10C95C` check circle); caps "À ACHETER · 2" with chips (32px, `#FFE14D`; **tap toggles the item on the grocery list**: circle shows + then ✓ and the chip turns green `#10C95C`, toast on add); "Rien à acheter, tout est là." in `#00753F` when nothing is missing; dashed rule; "Étapes · 4" and an ordered list (13px / 1.4, `#3F3E37`).
- Footer (2px top border, padding-top 14, gap 10), buttons 44px, radius 22, 800 14.5px, flex `1 1 140px`: **Planifier** / Plan (primary: `#2323FF`, white, shadow `3px 3px 0 ink`; calls the planner to add the recipe: toast "Ajouté à ..." in the full flow), **Recettes similaires** / Similar recipes (`#FFFDF8`; sets the recipe as the base, closes the pop-out and re-sorts the page), **Ouvrir la recette complète →** / Open the full recipe → (`#F4F1EA`, blue text; keep the existing recipe route). "Cuisiner" is not shown in this footer.

### Similar recipes mode
Tapping "Recettes similaires" (tile or pop-out) sets a **base recipe**: picked ingredients = all of its ingredients, the base is excluded from the results, and a **yellow banner** appears above the filters: `#FFE14D`, 2px border, radius 22, shadow `5px 5px 0 ink`, 130px photo at left (phone: stacked, 150px photo on top), caps "REPAS PRINCIPAL" / "MAIN MEAL", title 800 20px, hint, caps "INGRÉDIENTS UTILISÉS POUR LA RECHERCHE · touchez pour en retirer" and the base's ingredients grouped by category (Protéines, Fruits et légumes, Produits laitiers, Garde-manger; label column 130px DM Mono 600 10.5px uppercase, 1 column on phone). Each ingredient is a 30px pill with an 18px check circle; on = ink fill + yellow check; tap toggles it in the search. Results are headed "Recettes similaires à {title}" (800 18px) and each tile says "partage poulet, citron" / "shares chicken, lemon". The planner-only hint "Touchez une case vide…" in the banner does not apply on this page; hide or replace it. Category map is `CAT` in `part-finder-data.js`.

### Empty state
Dashed box (2px dashed ink, radius 16, padding 28, centred, 600 14px): "Aucune recette ne correspond." / "No recipe matches."

### Toast
Fixed bottom-centre (bottom 24), z 90, ink `#16181F` pill, cream text, Bricolage 700 14px, shadow `5px 5px 0 #2323FF`, padding 10px 12px 10px 20px, max width `100vw - 32px`; optional yellow "Annuler" / "Undo" pill. Auto-hides after 5 s. Messages used here: `listed`, `groceryMsg`.

## State
Finder: `q` (search), `chips` `{ ready, few, expiring, quick }` (ready and few are exclusive), `picks` (ingredient ids), `around` (picker open), `ingQ` (picker search), `shelfClosed` map, `showSales`, `listed` map `"recipeId:ingredientId" -> true`, `listOpenId` (tile whose popover is open), `prev` (recipe in the pop-out), `anim` (pop-out animation, desktop), `wkOpen` (In-your-week section open, default false), `baseLocal`/`exclude` (similar mode).
Derived: `base` (search + picks), per-recipe `missing`/`haveIngs` (from inventory), filtered `list`, `planned` map recipe id -> day index (from the planner), sections, listed items across recipes.
Page: language (shared with the header via `part-copy`; FR default), toast.

## Behaviour summary
- One overlay at a time: pop-out or grocery popover (each has its own scrim; click scrim to close).
- Changing search, ingredients, or filters re-sorts live; no loading state is drawn.
- Language switch (header) re-renders all text, ingredient names, and day names.
- Layout switches on the **container** width at 768px (ResizeObserver in the prototype; use a container query or width hook).
- Not drawn: loading, error and offline states; inventory empty state; real "Open the full recipe" route (goes to the v1 recipe card); Meal and Protein filter menus; Cook mode.

## Design tokens
| Token | Value |
| --- | --- |
| Canvas / Surface / Track | `#F4F1EA` / `#FFFDF8` / `#E9E4D8` |
| Ink / Soft / Muted | `#16181F` / `#3F3E37` / `#5E5B52` |
| Dash | `#BDB6A6` |
| Blue (primary, selected, have-bar) | `#2323FF`; tint `#E8E9FF` |
| Pink (expiring, planned tag) | `#FF48B0` |
| Yellow (time, to buy, banners) | `#FFE14D` |
| Green (ready, have, sales) | `#10C95C`; text `#00753F`; tint `#E4F6EA` |
| Shelves | Fridge `#4DE3FF`, Freezer `#A56BFF`, Pantry `#EAE3CF`, Spice rack `#FFB86B`, Baking `#FFD0E8` |
| Hard shadows (x y 0 ink) | 2/3/5/6/8px; selected pill `2px 2px 0 #2323FF`; ready tile `5px 5px 0 ink`; pop-out `8px 8px 0 ink` |
| Radii | pills 999px / 14 to 22 for buttons; tiles 20 (16 phone); popover 18; banner 22; pop-out 30 |
| Borders | 2px ink on cards, tiles, pills; 1 to 1.5px on small chips and tags; dashed `#BDB6A6` for dividers |
| Fonts | Bricolage Grotesque 500 to 800 (display, UI); Inter 400 to 700 (body hints); DM Mono 500/600 (captions: uppercase, letter-spacing .1 to .12em, 10 to 12px) |
| Type scale | h1 60px / 40px phone, 800; section title 20 / 16px; pop-out title 26px; tile name 15 / 13px; pills 12 to 13.5px / 700; caps 10 to 11px |
| Layout | max width 1280; page padding 40px desktop, 18px phone; tile grid 4 cols gap 16 (2 cols gap 10 phone) |

## Copy
FR and EN strings live in `part-finder-data.js` (keys used here: `searchLabel`, `placeholder`, `placeholderShort`, `ready`, `few`, `expiring`, `quick`, `meal`, `protein`, `showSales`, `count`, `count1`, `gReady/gFew/gShop` and `…D`, `inWeek`, `inWeekD`, `missing`, `nothing`, `uses`, `sharesNames`, `similar`, `similarShort`, `listHead`, `addOne`, `addedMark`, `addAllN`, `listCaps`, `openGrocery`, `groceryMsg`, `listed`, `have`, `buy`, `steps`, `portions`, `none`, `plan`, `openFull`, `mainMeal`, `baseIngCaps`, `cat*`, `pickerTitle`, `pickerSearch`, `addIng`, `noResults`, `plannedTag`) and the header/nav strings in `part-copy.js` (`nav.makeable` = "Faisable" / "Makeable"). Map each to the app's `i18n/en.js` / `fr.js` and reuse existing keys. Some FR strings are guesses and need the app's real wording.

## Assets
Recipe photos are Unsplash URLs in the sample data (replace with the app's photos). Ingredient emoji come from `EMOJI` in `part-finder-data.js`. No icons or other images; section chevron is a CSS triangle.

## Data the prototype fakes
Recipes, inventory (`INV`), shelves, expiring list (spinach 3 d, onion 4 d, celery 7 d), sales, and the planned-this-week map (comes from a sample planner week: crêpes, shakshuka, tzatziki, shawarma, déesse, roti, haricots, orzo...). Wire to the app's real recipes, inventory with expiry dates, flyer sales, grocery list and planner entries.

## Files in this folder
- `compare-makeable.dc.html` desktop + phone side by side
- `page-makeable-desktop.dc.html` entry (also used for phone)
- `page-makeable-mobile.dc.html` 390px frame
- `part-header.dc.html` header and nav
- `part-planner-board.dc.html` host: title, toast, language, container width (Planner/Recipes branches out of scope)
- `part-finder.dc.html` **all Makeable UI**: search, picker, filters, sections, tiles, popovers, pop-out, similar mode
- `part-finder-data.js`, `part-copy.js` sample data and copy
- `part-finder-sheet.dc.html`, `page-recipes-desktop.dc.html`, `part-plan-popup.dc.html` imported by the host, not part of this page
- `support.js` prototype runtime (not part of the app)
