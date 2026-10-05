# Handoff: Planner (desktop), Riso v2

## Overview
Redesign of the **Planner** page of The Matt Mo Cookbook (repo `matthieujgagnon/mealprep`, `client/src`). The user plans one week: 7 days x 3 meals (Déjeuner / Dîner / Souper; EN Breakfast / Lunch / Supper). Each slot holds a recipe, a note, or a "no meal planned" card. Recipes are found with a search panel under the board and placed by drag, by "+", or by clicking an empty slot. Quebec French first, English second.

Scope: **desktop, 1280px max width**. The phone Planner (390px) is a separate pass and is not covered here (the prototype has a rough bottom-sheet version; ignore it).

## About the design files
The files here are **design references created in HTML**: prototypes of the intended look and behaviour, not production code. Recreate them in the existing React app (components in `client/src/components`, styles in `client/src/index.css` under `.riso-theme`, strings via `t()` in `i18n/en.js` and `fr.js`). Do not copy the HTML or its inline styles. Reuse `PlannerBoard.jsx`, `PlannerTray.jsx`, `lib/plannerSlots.js`, `lib/plannerSuggestions.js` and `server/src/routes/planner.js` for data and rules; this handoff changes layout, look and interaction, not the data model.

## Fidelity
**High fidelity.** Match colours, type, spacing, borders, hard shadows and interactions. Use the app's `riso-*` classes and tokens where they exist.

## How to open the prototype
Open `Riso_V2_Page_Planner_Desktop.dc.html` in a browser from this folder (needs `support.js`). It is a thin wrapper: `Riso_V2_Part_Header_Both` + `Riso_V2_Part_FinderLive_Both` (embedded, view = planner). Takes about 30 seconds to load. The board is in `FinderLive`; the search panel is `Riso_V2_Part_Finder_Both` (wide layout, `ctx="planner"`); the empty-slot card is `Riso_V2_Part_FinderSheet_Both`. Sample data and copy: `Riso_V2_Part_FinderData_Both.js`, `Riso_V2_Part_Copy_Both.js`.

Other files: `Riso_V2_Doc_PlannerBrief_Both.md` (how the live page works today: slot kinds, card states, ranking, data) and `Riso_V2_Doc_PMBrief_Both.md` (what changed across v2 and why). Read the PlannerBrief for rules this prototype does not redraw.

## Page structure (top to bottom, max width 1280, centred)
1. **Header** (`Part_Header_Both`, `active="planner"`): padding 24px 40px. Shared with all pages; see main README of the v2 handoff.
2. **Title block**: caps line `5 – 11 OCT.` (EN `OCT 5 – 11`) in DM Mono 12px / 500 / letter-spacing .12em, then `<h1>` "La semaine **à venir.**" (EN "The week **ahead.**"), Bricolage Grotesque 800, 60px, line-height .95, letter-spacing -.035em; accent word `#2323FF`. Gap between them 6px. Page padding 8px 40px 56px; vertical gap between blocks 22px.
3. **"How it works" card** (dismissable, shown by default): `#FFFDF8`, 2px dashed ink, radius 18, padding 18px 22px 20px. Yellow rotated (-4deg) pill with title "Comment ça marche" / "How it works" (800 12px, 2px ink border, `#FFE14D`). Right: underlined link "Compris" / "Got it" (600 13px) hides it. Five bullets (14px / 1.45, 6px blue dot, 10px gap): copy keys `e1` to `e5`.
4. **Board card**.
5. **Search panel** (bottom, full width).
6. Toast, pop-up cards, pop-out and slot picker (overlays).

## Board
Card: `#FFFDF8`, 2px ink border, radius 26, padding 20px. Contents scroll horizontally if the grid is wider than the card (scrollbar hidden).

**Grid**: columns = `84px` label column + 7 x `minmax(104px, 1fr)`; gap 12px. Row 1 = day headers; rows 2 to 4 = Déjeuner, Dîner, Souper.

**Day header** (centred, padding 7px 0, radius 14, 2px border transparent): day name DM Mono 500 10.5px, letter-spacing .12em (`LUN`...`DIM`); date Bricolage 800 14px ("5 oct." / "Oct 5"). **Today**: background `#FF48B0`, 2px ink border, shadow `3px 3px 0 #16181F`, label `AUJ.` / `TODAY` instead of the day name. **Past days**: header opacity .55; their cells are greyscale at opacity .65 (still clickable).

**Row label**: Bricolage 800 15px, left column, vertically centred.

**Slot** (square-ish: `aspect-ratio .9`, radius 16, min-width 0). Four kinds:
- **Empty**: 2px dashed `#BDB6A6`, transparent. Hover while dragging: border and outline pink `#FF48B0`, fill `#FFE9F5`, shows "+". Selected (the slot whose pop-up card is open, or the target of the search panel): 2px solid `#2323FF`, fill `#E4E4FF`, "+" in blue (Bricolage 700 18px) and a `3px dashed #2323FF` outline with 3px offset.
- **Recipe card**: `#FFFDF8`, 2px ink border, radius 16, overflow hidden. Photo = top 58% (cover, `#E9E4D8` fallback) with a 2px ink bottom border. Title below: Bricolage 800 12.5px / 1.2, 2-line clamp, padding 8px 9px. Round remove button top-right (6px inset): 24px circle, 2px ink border, `#FFFDF8`, "×" 700 13px. **Leftover sticker** (when the entry is leftovers): yellow `#FFE14D` pill, 1.5px ink border, text "restes" / "leftover" 800 10px / 16px, rotated -4deg, anchored right 5px, overlapping the photo's bottom edge (bottom -10px).
- **Note card**: `#F4F1EA`, 2px solid ink border, radius 16, centred text Bricolage 700 13.5px / 1.2, padding 6px, 22px "×" button top-right. Emoji-only notes render at 40px / 400.
- **No meal planned** (blank): same as the note card with no text.

**Weekend marker** (configurable, see below): one rounded panel per run of consecutive weekend days, behind the slots. Fill `#F8F8FF` (alternatives tried: `#D9DBFF`, `#2323FF`; keep `#F8F8FF`), border `2px dotted #FF48B0`, radius 22, spans the day columns and all 4 grid rows, extends 8px beyond the cells. Weekend columns are shifted right 4px at the start of a run (+4px per extra weekend day) and slots shift down 4px x row index, so the panel breathes. When "include the evening before" is on and the run does not start on Monday, the panel also covers the **Souper** cell of the previous day (L-shaped panel: rounded 22px 22px 22px 0, plus a Souper-only segment with a rounded inside corner drawn as a dotted SVG arc). Default: Friday supper through Sunday. A yellow tag sits on the top edge, centred, rotated -3deg: `#FFE14D`, 2px ink border, shadow `2px 2px 0 #16181F`, DM Mono 500 10.5px, letter-spacing .12em, text "FIN DE SEMAINE" / "WEEKEND" plus a small ink circle with a yellow "▾". Clicking the tag opens the weekend menu.
- **Weekend menu** (popover, 300px, right-aligned under the tag, `#FFFDF8`, 2px border, radius 20, shadow `5px 5px 0`, padding 14): switch "Afficher la fin de semaine" / "Show the weekend" (44x26 pill switch, on = `#2323FF`, knob 18px ink); caps "JOURS" + 7 day toggle buttons (36px high, radius 12, selected = ink fill, cream text, shadow `2px 2px 0 #2323FF`); switch "Inclure le souper de la veille" / "Include the evening before"; caps "MODÈLES" / "PRESETS" + three preset pills: `Ven. soir – dim.` / `Fri eve – Sun` (default, eve on), `Sam. – dim.` / `Sat – Sun`, `Dim. – lun.` / `Sun – Mon`; helper text (Inter 500 12.5px): "Choisissez les jours que vous voulez, dans n'importe quel ordre. Le choix est gardé pour la prochaine visite." Click outside closes it. **Persisted** in `localStorage` key `mm-weekend` as `{ on, days: bool[7], eve }` (move to user settings in the app if one exists).
- When the weekend is off or has no days: a dashed pill "+ FIN DE SEMAINE" (DM Mono 10.5px, 2px dashed ink border, 26px high) sits at the top-right of the board, top -13px, right 22px, and reopens the menu.

**Legend row** under the grid: dashed top border (1.5px `#BDB6A6`), padding-top 12px, Inter 500 12.5px `#3F3E37`, gap 18px. Item 1 (if weekend on): 20x14 swatch (weekend fill, 2px dotted pink, radius 5) + "Fin de semaine : ven. soir + sam.–dim." (EN "Weekend: Fri eve + Sat–Sun"; built from the chosen days). Item 2: 20x14 pink swatch with 1.5px ink border + "Aujourd'hui" / "Today".

## Adding to a slot
Three ways, all end with a toast.

1. **Click an empty slot** opens the **slot card** next to it.
   - Size: 440px wide, `#FFFDF8`, 2px border, radius 24, shadow `6px 6px 0 #16181F`, padding 14px 16px 16px, max-height 660px (scroll). Placement: to the right of the clicked cell if it fits inside the board, else to the left (16px gap). Breakfast row: top-aligned with the cell; other rows: bottom-aligned (opens upward). Clicking outside or × closes it.
   - Header: caps `AJOUTER À` / `ADD TO` (DM Mono 10.5px) over the slot name (Bricolage 800 24px, e.g. "mar. · Souper" / "Tue · Supper"); 36px round × at right.
   - Three equal tiles in a row (gap 8, radius 16, 2px border, 40px high, label Bricolage 700 13px): **Recette** (fill `#2323FF`, white text), **Note** (`#FFE14D`), **Carte vide** in FR / "Nothing planned" in the finder copy (EN "Empty card"; `#FFFDF8`). The selected tile gets shadow `4px 4px 0 #16181F`. The card opens with no tile selected.
   - **Recette**: closes the card and sets the slot as the **target** of the search panel (see below), expands the panel and scrolls it into view.
   - **Note**: text input (48px, pill, 2px border, `#F4F1EA`, 16px, placeholder "Écrivez ce que vous voulez, ex. Resto" / "Write anything, e.g. Eating out"), quick pills (34px, 2px border; "Au resto / Restes / Commande / Pas de repas", EN "Eating out / Leftovers / Takeout / Skipping"; tapping one fills the input), and a full-width Save button (48px, "Enregistrer la note" / "Save note": `#2323FF` + white when the input has text, `#E9E4D8` + `#5E5B52` when empty; shadow `3px 3px 0 #16181F`). Enter also saves. Notes are 80 characters max (existing rule).
   - **Carte vide**: dashed box "Aucun repas prévu" / "No meal planned" + explanation + blue button "Marquer comme aucun repas prévu" / "Mark as no meal planned". Clicking it again on the board (existing behaviour) clears it.
   - Clicking an existing note slot opens the same card on the Note tile with the text filled in, to edit.
2. **Drag** a tile from the search panel onto any slot (tiles are `draggable`, payload = recipe id as `text/plain`). Hover state as above. Dropping on a filled slot **replaces** it.
3. **"+" on a tile** (blue 2px-bordered circle, top-right of the photo, shadow `2px 2px 0`): puts the recipe in the target slot if one is set, else opens the **slot picker** (below).

**Slot picker** (modal; centred; `min(760px, 100%)`, `#FFFDF8`, 2px border, radius 26, shadow `8px 8px 0`, padding 20; backdrop `rgba(22,24,31,.45)`): header with 60px rounded photo, caps "AJOUTER" / "ADD", recipe title (800 20px), × button. Caps "CHOISISSEZ LA CASE DANS LA SEMAINE" / "PICK THE SLOT IN THE WEEK", then a mini week grid (70px label column + 7 columns, gap 6): day heads (today pink), 58px-high cells (filled = recipe photo at .8 opacity or the note emoji; empty = 2px dashed `#BDB6A6`; selected = 3px blue border, `#E4E4FF`, shadow `3px 3px 0 #2323FF`, "+"; weekend cells tinted with the weekend fill). Preselected = next empty slot (upcoming days first, and inside a day Supper, then Lunch, then Breakfast; existing rule). Status bar (2px border, radius 14, 700 13.5px): green `#E6F5EC` "Case libre" / "Free slot", or yellow `#FFE14D` "Remplace {title}" / "Replaces {title}". Confirm button 50px, blue, "Ajouter à mar. · Souper" / "Add to Tue · Supper".

**Toast** (bottom-centre, fixed, z 90): ink `#16181F` pill, cream text, Bricolage 700 14px, shadow `4px 4px 0 #2323FF`, padding 10px 12px 10px 20px; optional "Annuler" / "Undo" yellow pill. Auto-hides after 5 s. Messages: "Ajouté à {slot}" / "Added to {slot}", "{title} remplacé" / "{title} replaced", "Retirer · {slot}" style message on remove (key `clear`), "Restes de {title} ajoutés à {slot}". Undo restores the previous entry for that slot.

## Opening and removing a planned meal
- Click a **filled recipe slot**: opens a pop-up card beside it (same placement and shell as the slot card) titled `REPAS PRÉVU` / `PLANNED MEAL` + slot name. It holds the recipe preview (photo 140px, name 800 22px, `⏱ 40 min · 4 portions · Souper`, "Vous avez" green chips, "À acheter" chips, 4 steps) and three stacked 44px pill buttons: **Cuisiner** / Cook (primary blue), **Utiliser comme base pour d'autres repas** / Use as a base for other meals, **Remplacer cette recette** / Replace this recipe. "Cuisiner" opens Cook mode (not redesigned; show the toast `cookMsg` in the prototype).
- Only the **×** on the card removes it (with Undo toast). Clicking the card never removes.
- **Replace**: sets that slot as the target of the search panel (chip "AJOUTER À mar. · Souper", plus yellow notice "Remplace {title}" / "Replaces {title}").
- **Use as a base** (leftovers): the recipe becomes the "main meal" (yellow banner in the search panel, see below) and the board enters leftover mode: clicking any **empty** slot puts the recipe there with the **leftover** sticker (toast "Restes de ... ajoutés à ..."). "Annuler" / "Cancel" in the banner leaves the mode.

## Search panel (under the board)
Card: `#FFFDF8`, 2px border, radius 28, padding 14px 24px 20px; centred 48x5 grab handle `#BDB6A6` at the top; gap 12. Contents are `Part_Finder_Both` (wide, planner). Two states:

- **Collapsed** (default): only the search bar, plus a row with Inter 500 13.5px hint "Cherchez une recette, puis glissez-la sur une case ou touchez +." (EN "Search for a recipe, then drag it onto a slot or press +.") and a **Parcourir** / "Browse" button (38px, radius 19, `#2323FF`, white, shadow `3px 3px 0 #16181F`). Expands when: the user types, "Browse" is pressed, a target slot is set, or a main meal is set. When expanded, a link "Masquer" / hide collapses it again.
- **Expanded**: search bar, filters, optional "With" strip, optional main-meal banner, result count and recipe grid.

**Search bar**: pill, 2px border, `#FFFDF8`, shadow `5px 5px 0 #16181F`, padding 6px 10px; left chip "RECHERCHE" / "SEARCH" (34px, radius 17, `#F4F1EA`, DM Mono 500 11px, letter-spacing .1em); optional yellow **target chip** `AJOUTER À mar. · Souper ×` (30px high, `#FFE14D`, ink × circle clears the target); input 44px high, Bricolage 500 16px, placeholder "Titre, ingrédient ou étiquette" / "Title, ingredient or tag"; round × clears text. Matches on title and ingredient names, case-insensitive.

**"With" strip** (attached under the bar: `margin -8px 14px 0`, `#F4F1EA`, 2px dashed ink, no top border, radius 0 0 18px 18px, padding 12px 14px): caps "AVEC" / "WITH", one ink pill per chosen ingredient (28px, ink fill, white text, shadow `2px 2px 0 #2323FF`, yellow × circle removes it), and a dashed pill "+ Ajouter un ingrédient ▾" / "+ Add an ingredient ▾" that opens the **ingredient picker**: white card, 2px border, radius 22, shadow `5px 5px 0`, padding 14. Title caps "INGRÉDIENTS DE VOTRE CUISINE", blue-tint count pill "N choisis" / "N chosen", × to close (no Done button), search input (38px pill, "Chercher un ingrédient"), then a pink pill "Expire bientôt" / "Expiring soon" + caps help "LES RECETTES QUI LES UTILISENT PASSENT EN PREMIER", the expiring items (spinach 3 d, onion 4 d, celery 7 d; format "3 j" / "3d"), a dashed rule, then a 3-column grid of **shelf drawers** (2px border, radius 16): header = name pill + count ("2/8" when some are picked) + round +/− toggle. Shelf pill colours: Fridge `#4DE3FF`, Freezer `#A56BFF`, Pantry `#EAE3CF`, Spice rack `#FFB86B`, Baking `#FFD0E8` (custom shelves choose their own). Ingredient chip: 28px, 1px ink border, emoji + name; picked = `#E4E4FF`, shadow `1.5px 1.5px 0 #2323FF` and a 16px blue ✓ circle. Picking ingredients keeps only recipes that use at least one of them, sorted by how many they use; each tile then shows "utilise poulet et citron" / "uses chicken and lemon".

**Filter row** (gap 8px 14px, wraps): segmented control (36px, 2px border, pill, `#FFFDF8`) **Tout / Faisable maintenant / 1 ou 2 à acheter** (EN All / Makeable now / 1 or 2 to buy), each with a 9px dot (white / green `#10C95C` / yellow `#FFE14D`) and a DM Mono count; selected segment = ink fill, cream text. Toggle pills (36px high, 2px border, radius 19, 700 13.5px): **Expire bientôt** (pink `#FF48B0` dot) and **Rapide** (<= 30 min); selected = ink fill, cream text, shadow `2px 2px 0 #2323FF`. Right-aligned (auto margin): menu pills **Repas** and **Protéine** with ▾. Filters combine (AND). "Faisable maintenant" = nothing to buy; "1 ou 2" = one or two missing.
- The prototype draws the Meal and Protein menus but does not open them. Build them like the Recipes page menus (`RisoControls.jsx`, lists that open under the pill).
- There is no "Show sales" toggle on the Planner (it belongs to Makeable).

**Main-meal banner** (when a base recipe is set): yellow `#FFE14D`, 2px border, radius 20, shadow `4px 4px 0 #16181F`, 130px photo left; caps "REPAS PRINCIPAL" / "MAIN MEAL", title 800 20px, hint "Touchez une case vide du planificateur pour y mettre des restes." Below: caps "INGRÉDIENTS UTILISÉS POUR LA RECHERCHE · touchez pour en retirer" and its ingredients grouped by category in rows (label column 130px, DM Mono 600 10.5px uppercase): Protéines, Fruits et légumes, Produits laitiers, Garde-manger (categories in `FinderData` `CAT` / `CAT_ORDER`). Each is a 30px pill with an 18px check circle; on = ink fill + yellow check. Results below are titled "Recettes similaires à {title}" and sorted by shared ingredients ("partage 3 ingrédients" / "shares 3 ingredients"); the base recipe itself is excluded.

**Result grid**: caps count line ("10 recettes" / "10 recipes", DM Mono 500 11px, .12em), then 4 columns, gap 16 (3 columns if an inline preview is open; not used here). Tile: `#FFFDF8`, 2px ink border, radius 20; photo 136px with a 2px ink bottom border; time pill bottom-right of the photo (`#FFE14D`, 1.5px border, 800 11px, "⏱ 40 min"); body padding 10px 12px 12px, gap 5: name (800 15px / 1.2, 2-line clamp), **have-bar** (8px high, 1.5px border, `#E9E4D8` track, `#2323FF` fill = on-hand ingredients / total), availability line (600 11.5px: "Rien à acheter" in `#00753F`, or "2 à acheter" / "1 à acheter" in `#3F3E37`), and the "uses ..." line when ingredients are picked. Tiles whose recipe needs nothing from the store carry a `5px 5px 0 #16181F` shadow (the "ready" signal used across the app). Tiles planned this week show the pink "Prévu mercredi" / "Planned Wednesday" tag (`#FF5CB8`, ink text) in the recipe pop-out; the finder sets `planned` from the board.
- Empty result: dashed box "Aucune recette ne correspond." / "No recipe matches."

**Recipe pop-out** (click a tile): 680px wide, centred in the viewport (never off-screen: min 16px margins), `#FFFDF8`, 2px border, radius 22, shadow `8px 8px 0 #16181F`, padding 18. It grows out of the tile and returns on close (0.35s `cubic-bezier(.2,.8,.2,1)`, scale .9 to 1, opacity). The tile stays in the grid, blurred 2px; the rest of the page gets a `rgba(22,24,31,.5)` scrim with 5px backdrop blur (click to close). Layout: header row (name 800 26px/1.08 and below it a yellow time pill "⏱ 40 min | 4 portions" 26px high and a `#F4F1EA` meal chip; 34px × button), then two columns (300px | 1fr): photo (270px high, radius 16, 2px border); right: optional pink planned tag, caps "VOUS AVEZ · N" with green chips (32px, `#E6F5EC`, 20px `#10C95C` check circle), caps "À ACHETER · N" with chips (32px, yellow `#FFE14D`; tap toggles the item on the grocery list, circle shows + then ✓ and the chip turns green `#10C95C`; "Rien à acheter, tout est là." in `#00753F` when none), dashed rule, "Étapes · 4" with the ordered steps (13px / 1.4, `#3F3E37`). Footer (2px top border, 14px padding, gap 10): primary blue "Ajouter à mar. · Souper" (or "Ajouter à la prochaine case libre" when no target), "Recettes similaires" (sets the main meal), and a text-style button "Ouvrir la recette complète →" (`#F4F1EA`, blue text). "Cuisiner" is not shown here. The prototype's "Open the full recipe" still links to the v1 recipe card; keep the existing route until the v2 recipe card exists.

## State
- Week entries: `{ [dayIndex-mealIndex]: { r: recipeId, left?: bool } | { note: string } | { blank: true } }` (prototype key = `"day-meal"`; in the app use the existing planner entries).
- UI: `selected slot` (open slot card), `selMode` (none | note), `noteInit`, `anchor` (cell rect for pop-up placement), `cv` (open planned-meal card), `target` (slot the search panel adds to), `base` (main meal recipe), `picker` (recipe + slot being confirmed), `toast` (message + undo), `over` (slot under a drag), `exp` (How-it-works visible), `weekend` `{ on, days[7], eve }` (persisted), `wkMenu` open.
- Finder: query, chips (`ready`, `few`, `expiring`, `quick`), picked ingredients, main meal id, open recipe id, ingredient-picker open state, per-shelf open state, "listed" grocery items.
- Derived: `planned` map recipe id to day index (feeds the pink "Prévu" tag and the "In your week" logic), next empty slot, expiring list (ingredients expiring within 7 days).

## Behaviour summary
- Exactly one overlay at a time: slot card, planned-meal card, weekend menu, picker, or recipe pop-out. Outside click closes the first three.
- Selecting a target keeps the panel expanded and scrolls it into view (offset 24px).
- After any placement: selection, target and cards clear; toast shows; Undo available when something was replaced or when placing a recipe.
- Past days are dimmed but editable.
- Language switch (header) re-renders everything; day and meal names, dates and strings all come from `t()`.
- Container width below 768px switches to the phone layout (out of scope here).

## Not in this prototype (keep from the live app or redesign later)
These exist in the live Planner (see PlannerBrief) and are **not drawn** in the desktop prototype: week picker and previous/next week arrows with "this week" badge, "Fill N empty slots", "Copy last week's plan" (only on empty weeks), the round button on a recipe card that cycles plain / leftover / already-have (and the "past fridge life" warning), the "Make the grocery list" action, moving a card by dragging it to another slot, and the Suggested / Plan around / All tabs of the old side menu (replaced by this search panel). Keep their behaviour; style them with the tokens below when added. The sample week (Oct 5 to 11, today = Tuesday) is fixed data.

## Design tokens
| Token | Value |
| --- | --- |
| Canvas / Surface / Track | `#F4F1EA` / `#FFFDF8` / `#E9E4D8` |
| Ink / Soft / Muted | `#16181F` / `#3F3E37` / `#5E5B52` |
| Dash | `#BDB6A6` (also `#D6CFBF`) |
| Blue (primary, selected) | `#2323FF`; tint `#E4E4FF` |
| Pink (today, expiring, weekend dots) | `#FF48B0`; planned tag `#FF5CB8`; drop-hover tint `#FFE9F5` |
| Yellow (time, to buy, banners, notes) | `#FFE14D` |
| Green (ready, have) | `#10C95C`; text `#00753F`; tint `#E6F5EC` |
| Weekend fill | `#F8F8FF` |
| Shelves | Fridge `#4DE3FF`, Freezer `#A56BFF`, Pantry `#EAE3CF`, Spice rack `#FFB86B`, Baking `#FFD0E8` |
| Hard shadows (x y 0 ink) | 2/3/4/5/6/8px; selected pill `2px 2px 0 #2323FF`; today `3px 3px 0 ink`; ready tile `5px 5px 0 ink` |
| Radii | pills 999px; slots 16; tiles 20; cards 22 to 24; board 26; search panel 28 |
| Borders | 2px ink on cards, tiles, pills and slots; 1 to 1.5px on small ingredient chips and tags; dashed `#BDB6A6` for empty/divider |
| Fonts | Bricolage Grotesque 500 to 800 (display, UI); Inter 400 to 700 (body text, hints); DM Mono 500/600 (captions: uppercase, letter-spacing .1 to .12em, 10 to 12px) |
| Sizes | h1 60px/800; slot name in pop-up 24px/800; recipe title in pop-out 26px/800; tile title 15px/800; slot card title 12.5px/800; pills 12 to 13.5px/700; body hints 13 to 14px |
| Layout | max width 1280; page padding 40px; board padding 20px; grid gap 12; label column 84px; day column min 104px; tile grid 4 columns, gap 16 |

## Copy
FR and EN strings are in `Riso_V2_Part_FinderData_Both.js` (keys such as `weekendTag`, `e1`..`e5`, `addToCaps`, `modeRecipe`, `modeNote`, `modeBlank`, `noteType`, `q1`..`q4`, `blankTitle`, `blankText`, `blankBtn`, `saveNote`, `added`, `replacedMsg`, `leftoverAdded`, `undo`, `browseHint`, `plannedTag`, `similarTo`, `sharesN`) and in the `planner` block of `Riso_V2_Part_Copy_Both.js`. Map each to the app's `i18n/en.js` / `fr.js` and reuse existing keys. "Dinner" is renamed "supper" (FR "souper"). Some FR strings are guesses and need the app's real wording.

## Assets
Recipe photos are Unsplash URLs in the sample data (replace with the app's recipe photos). Emoji on ingredient chips come from `FinderData` `EMOJI`. No icons or images otherwise; the weekend corner arc is a small inline SVG.

## Data the prototype fakes
Recipes, inventory, shelves, the expiring list (spinach 3 d, onion 4 d, celery 7 d), the starting plan, and the planned-this-week map are sample data. Wire to the app's real recipes, inventory with expiry dates, and planner entries (see PlannerBrief section 7). Ranking and suggestion rules stay in `lib/plannerSuggestions.js`.

## Files in this folder
- `Riso_V2_Page_Planner_Desktop.dc.html` entry
- `Riso_V2_Part_Header_Both.dc.html` header
- `Riso_V2_Part_FinderLive_Both.dc.html` board, overlays, weekend logic
- `Riso_V2_Part_Finder_Both.dc.html` search panel, filters, tiles, pop-out
- `Riso_V2_Part_FinderSheet_Both.dc.html` empty-slot card (Recipe / Note / Empty card)
- `Riso_V2_Part_FinderData_Both.js`, `Riso_V2_Part_Copy_Both.js` sample data and copy
- `Riso_V2_Doc_PlannerBrief_Both.md`, `Riso_V2_Doc_PMBrief_Both.md` context
- `support.js` runtime for the prototype (not part of the app)
