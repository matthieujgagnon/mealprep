# Handoff: Planner search cards and note pop-up

## Overview
Two changes to the Planner page (`page-planner-desktop`):
1. **Search result cards** (the recipe grid under "Parcourir" / search) now use the same look as the Makeable card, without the ingredient panel.
2. **Note pop-up** (opens when you click an empty slot, Note tab): Save note and Remove note sit side by side, with more spacing.

## About the Design Files
The HTML files are **design references**: prototypes of the intended look and behavior, not production code. Recreate them in the target codebase (React, Vue, SwiftUI, native, etc.) with its own components and patterns. Open `page-planner-desktop.dc.html` in a browser; all files in this folder must stay together (they import each other by file name). Recipes, photos (Unsplash) and counts are placeholders.

## Fidelity
High-fidelity. Colors, type, spacing and interactions are final.

## 1. Search result card (planner only)
Grid: 4 columns on desktop (2 in compact/phone), gap 16px (10px compact). Shown only when the finder runs with `ctx="planner"`. Recipes and Makeable pages keep their own cards.

**Card**
- Radius 20px, border 2px solid #16181F (#3DC97D when the recipe is complete, nothing missing), background #FFFDF8.
- Shadow: `0 10px 24px -6px rgba(22,24,31,.35), 0 2px 6px rgba(22,24,31,.15)`. While its preview is open: hard shadow `6px 6px 0 #16181F`.
- Overflow hidden. Whole card is clickable (opens the recipe preview) and draggable onto a planner slot.

**Photo** (230px high, 190px compact), cover-fit
- Top gradient: `linear-gradient(to bottom, rgba(22,24,31,.7), rgba(22,24,31,0) 30%)`.
- Top label, left 12px, top 12px, right inset 44px (room for +): `MEAL · TIME`, uppercase, DM Mono 600 9.5px, letter-spacing .04em, color #FFFDF8, text-shadow `0 1px 6px rgba(0,0,0,.6)`, one line, ellipsis. Example: `SOUPER · 1 H 30 MIN`.
- Bottom gradient: height 56%, `linear-gradient(to top, rgba(14,16,22,.9) 0%, rgba(14,16,22,.64) 40%, rgba(14,16,22,0) 100%)`, padding 0 12px 10px, content aligned to the bottom.
- Title: Bricolage Grotesque 700 16px / 1.12, centered, #FFFDF8, text-shadow `0 1px 8px rgba(0,0,0,.45)`, max 3 lines, text-wrap balance.
- **+ button**: top 8px, right 8px, 32px (28px compact) circle, background #2323FF, white "+", 2px #16181F border, shadow `3px 3px 0 #16181F`. Adds the recipe to the selected slot (or next empty slot).

**Info row** (below photo): padding 11px 12px 14px, flex space-between, DM Mono 500 10px, letter-spacing .1em, color #3F3E37, no wrap.
- Left: `have/total` ingredients, e.g. `4/6`.
- Right: `COMPLET` / `COMPLETE` when nothing is missing, otherwise `N MANQUANT(S)` / `N MISSING`.

**Progress bar**: absolute bottom, full width, 4px, track #EFEBE0, fill #8F8FFF at have/total %.

No ingredient chips, no action buttons, no flip-to-list on this card.

## 2. Note pop-up (planner slot sheet)
Content of the slot pop-up on the Note tab (also the side panel and phone sheet, same component).
- Vertical gap between header, tabs and body: 20px (was 12px).
- Tabs (Recipe / Note / Nothing planned): 3 equal tiles, gap 10px.
- Note body: column, gap 18px: text input (48px, pill, 2px border, bg #F4F1EA, 16px) then quick pills (gap 10px, 34px high: Eating out, Leftovers, Takeout, Skipping), then the button row.
- Button row: flex, gap 14px, padding-top 4px. Two equal buttons (flex 1), 48px high, pill, 2px #16181F border, Bricolage 800 16px:
  - **Save note**: bg #2323FF with white text when the input has text, else #E9E4D8 / #5E5B52; shadow `3px 3px 0 #16181F`. Saves, clears the field and closes.
  - **Remove note** (FR "Retirer la note"): bg #FFFDF8, hover #FFE9F5, no shadow. Shown only when editing an existing note. Clears the slot (same as the × on a planned card, with the undo toast).
- "Nothing planned" body: dashed info box, then a blue full-width button, gap 18px.

## Interactions & State
- Finder: search text, ingredient filters, tab (Tout / Faisable maintenant / 1 ou 2 à acheter), preview open id. Card has no local state besides hover/drag.
- Sheet: `mode` (recipe | note | blank), `note` text. Props: `noteInit` (existing note, enables Remove), `onNote`, `onBlank`, `onRemove`, `onClose`.
- Board: `onRemove` clears the selected slot to empty.

## Design Tokens
- Ink #16181F, paper #F4F1EA, card #FFFDF8, track #EFEBE0, border light #E4DED0
- Blue #2323FF, progress lavender #8F8FFF, green #3DC97D, yellow #FFE14D, pink tint #FFE9F5
- Fonts: Bricolage Grotesque (500–800), DM Mono (500, 600)
- Radii: card 20px, pills fully rounded, + button 50%

## Assets
Recipe photos are Unsplash placeholders. No icons beyond text glyphs (+, ×).

## Files
- `page-planner-desktop.dc.html`: the page (open this)
- `part-planner-board.dc.html`: week board, slot pop-up host, passes `onRemove`
- `part-finder.dc.html`: search and results; card markup is the block gated by `cardNew` (planner) vs `cardOld`
- `part-finder-sheet.dc.html`: slot pop-up (tabs, note form, Save/Remove)
- `part-finder-data.js`, `part-copy.js`: sample recipes and EN/FR copy (`removeNote` added)
- `part-header.dc.html`, `page-planner-header.dc.html`, `page-recipes-desktop.dc.html`, `part-plan-popup.dc.html`: shared pieces the page imports
- `support.js`: prototype runtime (not part of the app)
