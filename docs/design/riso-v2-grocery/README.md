# Grocery list (approved row 6a): handoff

Rebuild the Grocery page in `client/src/components/GroceryList.jsx` and `GroceryItem.jsx` (line form), and their styles (`.riso-grocery*`, `.riso-group*`, `.riso-row*`) in `client/src/index.css`, to match `Grocery.dc.html`.

What changes:
- The row has a new desktop grid.
- The checkbox has three steps: to buy, bought, queued for inventory.
- Each store gets one "Add to inventory" footer, replacing the per-row "+ Inventory".
- The number becomes a pill.
- The sale price links to the Deal card.
- The How it works strip becomes a live demo.
- The phone cart becomes a small bar.

Everything else on the page stays as it is today: the header, view switch, add field, side cards, removed strip, Add a store and "I'm at the store".

## About the design files
`Grocery.dc.html` is a **design reference built in HTML**, not production code. Rebuild it with the app's existing React components, CSS conventions and i18n. To view it, open it in a browser with `support.js`, `kit.js` and `AppHeader.dc.html` in the same folder. Every checkbox and every store's Add button works. `Archive - Grocery (live code).dc.html` shows what the app draws today, for comparison.

## Fidelity
**High fidelity.** Colours, type, spacing, radii and copy are final. Items, prices and stores are sample data.

States in the file:
- **8.1** By store, with the hint strip
- **8.2** By aisle
- **8.3** By recipe
- **8.4** Everything checked
- **8.5** Nothing planned

Each state is shown at desktop 1280 and phone 390, in English and French.

---

## 1. Three-step checkbox (desktop and phone)
Each tap of the checkbox moves the item to the next state and wraps back to the start. The hit area is 44×44. The box inside it is 30×30, radius 9px, with a 2px `#16181f` border. Background transitions take 160ms.

| State | Box | Row bg | Name | Number pill | Tooltip |
| --- | --- | --- | --- | --- | --- |
| 0 To buy | `#fffdf8`, empty | transparent | `#16181f` | 2px `#16181f` border, ink text | "Mark as bought" / « Marquer comme acheté » |
| 1 Bought | `#2323ff`, white ✓ (800 17px) | `#f4f1ea` | `#5e5b52`, line-through | border `#a9a598`, text `#5e5b52` | "Queue for inventory" / « Mettre en attente pour l'inventaire » |
| 2 Queued | `#2323ff`, white + (800 22px) | `#ebebff` | `#5e5b52`, line-through | as bought | "Put back on the list" / « Remettre dans la liste » |

- A queued row's meta line starts with "→ INVENTORY" / « → INVENTAIRE » (DM Mono 600 11px, 0.06em, `#2323ff`). If anything else follows it on the line, a 4px `#5e5b52` dot separates them.
- Bought and queued items still count as "in cart". The cart counts every item in state 1 or 2.
- The row no longer has a "+ Inventory" button.

## 2. Store footer: Add to inventory
The footer appears under a group only when at least one of its items is queued.
- **Bar:** `#ebebff`, 2px ink top border, padding 14px 16px 14px 20px, gap 12px. Desktop is a row with space-between. Phone is a column that stretches to full width.
- **Left text:** "{n} queued · Milk 2%, …" / « {n} en attente · … ». DM Mono 500 12px/1.5, 0.08em, uppercase, ink. The names are the queued items, with a capital first letter, separated by commas.
- **Button:** "+ Add {n} to inventory" / « + Ajouter {n} à l'inventaire ».
  - 40px tall, radius 20px, padding 0 18px, 2px ink border.
  - `#2323ff` background, white text, 600 14px Bricolage.
  - Shadow `3px 3px 0 #16181f`. On press: `translate(2px,2px)` with a `1px 1px 0` shadow.
  - It sends those items to Inventory and removes them from the list. In the app, this goes through the existing Inventory confirm sheet.

## 3. Desktop row and store header (one shared grid)
The header and every row use the same grid:
- Columns: `44px minmax(0,1fr) 128px 76px 56px 32px`
- Column gap: 12px

**Store header:**
- Padding 14px 12px 10px 14px, 2px ink bottom border, items aligned to the bottom (`align-items: end`).
- Columns 1–2 hold the grip ⠿ (By store only, `#5e5b52` 16px), the name (800 22px Bricolage, nowrap) and the count line (DM Mono 500 11px, 0.08em, `#3f3e37`). The count reads "{n} to buy · {m} on sale".
- Column labels: "ON SALE", "RECIPE", "BUY" (BUY is right-aligned). French: « EN SOLDE », « RECETTE », « ACHETER ». DM Mono 500 10.5px, 0.1em, `#5e5b52`.
- Last column: a 26px round × with a 1.5px border, only on stores you made. It opens the ConfirmDialog (see `design_handoff_live_app_fixes`, Fix 3).

**Row:**
- Min-height 68px, padding 10px 12px 10px 14px.
- Rows after the first are separated by `1.5px dashed #d6cfbf`.
- **Name:** 800 15.5px/19px Bricolage, -0.01em, `overflow-wrap: break-word`. Always starts with a capital ("lemons" → "Lemons").
- **Meta line** (gap 8px, nowrap with ellipsis on the recipes), in this order:
  - the queued label (§1)
  - "Added by you" / « Ajouté par vous » for items you added yourself (DM Mono 400 11px, 0.04em, `#a9a598`)
  - the brand (600 12.5px Bricolage) and a 4px dot
  - the recipes (DM Mono 500 11px, 0.06em, uppercase, `#3f3e37`, or `#5e5b52` when checked). With 3 or more recipes, show the first and then "+{n-1}" (e.g. "LENTIL SALAD WITH FETA +2").
- **On sale** (36px tall cell): a link to the Deal card. Hidden once the item is checked.
  - Inline-flex, 32px tall, radius 16px, padding 0 8px, margin-left -8px. On hover the background turns `#c9f5da`.
  - Contents: a 10px green dot (`#10c95c`, 1.5px ink border, radius 5px), the price (DM Mono 700 13.5px with a 1.5px dotted ink underline), then › (700 13px).
  - In By aisle and By recipe, the store name follows the price (600 12px Bricolage, `#3f3e37`).
- **Recipe:** the amount the recipe needs ("900 g"), DM Mono 500 12.5px `#5e5b52`, nowrap.
- **Buy:** a 52×36 pill (radius 18px, 2px border, `#fffdf8`, DM Mono 700 15px), right-aligned. It replaces the 42px round number.
- **×:** 32×44, 600 20px Bricolage, `#5e5b52`. It removes the item into the "Removed" strip, as today.

## 4. Phone row
The phone keeps today's layout:
- 108px tall
- the meta line wraps and shows the recipe amount as a dashed chip
- the 42px round number and the 44px circled ×
- no sale tag when the phone is upright

It does take the changes from §1 (three-step checkbox, row colours, "→ INVENTORY" text), §2 (the store footer, stacked) and the "Added by you" label. The "+ Inventory" button is removed here too.

## 5. Phone cart bar
This replaces the big pink cart card on phone (that card stays on desktop).
- **Placement:** directly under the How it works box, or, once that box is dismissed, just above the add field.
- **Bar:** `#ff48b0`, 2px ink border, radius 18px, shadow `3px 3px 0 #16181f`, padding 10px 10px 12px 14px, gap 10px.
- **Top row:**
  - the count (800 34px/0.9 Bricolage, -0.04em)
  - a column with "IN YOUR CART" (DM Mono 500 10.5px, 0.12em, uppercase) above "{n} items checked" (700 13.5px)
  - on the right, a "Done shopping" / « Terminé » pill: 36px, radius 18px, `#16181f` with `#f4f1ea` text, 700 13px. At 50% opacity when nothing is checked.
- **Progress bar:** 8px tall, radius 4px, `#f4f1ea` track, 2px ink border, `#16181f` fill at checked ÷ total. Right margin 4px.

## 6. How it works strip (first visit, By store)
- **Box:** `#fffdf8`, 2px dashed ink border, radius 20px, padding 12px 16px (phone 12px 14px), gap 16px.
- **Top row:**
  - the yellow "How it works" sticker (rotated -4°)
  - the title "Each checkbox has three steps." / « Chaque case a trois étapes. » (700 15px/1.3). On phone the title wraps onto its own line under the sticker.
  - "Got it" (600 13px, underlined), pushed to the right
- **Body:** two equal columns, gap 24px. On phone they stack with a 12px gap.
  - **Left: a live demo row** ("Lemons", qty 2).
    - It cycles through the three states every 1.8s. Once the user taps the box, the timer stops and each tap moves it on by one.
    - The meta line reads "Added by you" for states 0–1 and "→ INVENTORY" (blue) for state 2.
    - The caption underneath reads "TRY IT: CLICK THE BOX" / « ESSAYEZ : CLIQUEZ SUR LA CASE », and "KEEP CLICKING" / « CLIQUEZ ENCORE » after the first tap.
  - **Right: three step rows.** Each row has a 24px box, a 96px title (92px on phone) and a sub line. The row for the step just reached gets a 2px ink border and a background tint (`#f4f1ea` for ✓, `#ebebff` for +). The other rows are transparent with a `#5e5b52` sub line.
    - "Click once": "Bought, crossed off" / « Un clic »: « Acheté, rayé de la liste »
    - "Click twice": "Queued for your inventory" / « Deux clics »: « En attente pour l'inventaire »
    - "Click again": "Back on the list" / « Trois clics »: « De retour dans la liste »
- **Tips row:** above it, a `1.5px dashed #d6cfbf` rule with 14px padding. Two columns that stack on phone:
  - A sample blue pill "+ Add 2 to inventory", then "One button at the bottom of each store adds everything queued." / « Au bas de chaque magasin, un seul bouton ajoute tout ce qui est en attente. »
  - A sample sale chip (`#c9f5da` pill with a green dot, the price and ›), then "Tap a sale price to see the deal." / « Touchez un prix en solde pour voir l'offre. »

## 7. New i18n strings
Add these to `en.js` and `fr.js`. The wording is in the sections above.
- the three checkbox tooltips (§1)
- the queued label "→ INVENTORY" (§1)
- the queued line and the "+ Add {n} to inventory" button (§2)
- the column labels "ON SALE" / "RECIPE" / "BUY" (§3)
- "Added by you" (§3)
- "Done shopping" short form for the phone bar (§5)
- the hint title, demo captions, step titles and subs, and both tips (§6)

These keys already exist in the app and are reused: `grocery.inCart`, `grocery.itemsChecked`, `grocery.groupToBuy`, `grocery.groupOnSale`, `common.howItWorks` and `common.gotIt`.

## 8. State
- Each item has `status: 0 | 1 | 2` (to buy, bought, queued), saved with the list the same way `checked` is today. Existing `checked: true` items map to 1.
- "Add to inventory" on a store takes that store's status-2 items, runs them through the Inventory confirm sheet, then removes them from the list.
- The hint demo's step and the "user has tapped" flag live only in the component. They are not saved.

## 9. Tokens
- Ink `#16181f`
- Paper `#f4f1ea`
- Card `#fffdf8`
- Blue `#2323ff`
- Queued tint `#ebebff`
- Pink `#ff48b0`
- Yellow `#ffe14d`
- Green `#10c95c`
- Sale hover `#c9f5da`
- Muted text `#5e5b52` / `#3f3e37`
- Faint `#a9a598`
- Dashed rule `#d6cfbf`

Fonts:
- **Bricolage Grotesque:** names and buttons
- **DM Mono:** meta lines, numbers and labels
- **Inter:** body text

## Files
- `Grocery.dc.html`: the approved design (states 8.1–8.5)
- `Archive - Grocery (live code).dc.html`: what the app draws today
- `Deal Card.dc.html`: where the sale price link goes
- `AppHeader.dc.html`, `kit.js`, `support.js`: needed to open the designs
