# Handoff: Inventory, Compact + Tiles (desktop and phone)

## Overview
A rebuild of the Inventory page ("What you've got.") that takes up less space than v1, plus a second view with product-photo tiles. The user switches between the two with a **Compact / Tiles** toggle. A single responsive page serves both desktop (1280) and phone (390).

## About the design files
The files here are **design references made in HTML**. They show the intended look and behaviour. They are not production code. Rebuild them in the app's existing stack (Matt Mo Cookbook, mealprep backend) using its current components, data and patterns.

- `page-inventory-desktop.dc.html`: the page. Open it in a browser. Append `?view=tiles` or `?view=compact` to force a view.
- `page-inventory-mobile.dc.html`: two 390×844 phone frames that iframe the same page, one per view.
- `part-header.dc.html`, `part-copy.js`: the shared app header, already in the app. No changes.
- `image-slot.js`, `support.js`: prototype runtime only. Do not port them.

## Fidelity
**High fidelity.** Colours, type, spacing, radii and states are final. Behaviour carries over from the live v1 Inventory (item pop-up, bulk actions, shelf editing, drag between shelves). Only the sizing changed, plus the new Tiles view.

## Layout

### Page
- Background `#F4F1EA`. Content max-width 1280, centred.
- Header: the existing `part-header` with Inventory active.
- Side padding: 40px on desktop, 16px when the viewport is under 640px.
- Vertical gap between blocks: 16px. Bottom padding: 32px.

### Title row
Flex row, `align-items:flex-end`, gap 16, wraps.
- Left: summary line `{N} ITEMS · {n} TO USE SOON[ · {n} EXPIRED]` in DM Mono 500 11.5px, letter-spacing .12em. Under it, "What you've **got.**" in Bricolage Grotesque 800 40px/0.95, letter-spacing -.035em. "got." is `#2323FF`.
- Right, gap 8, wraps on phone:
  1. **View toggle**: 36px tall pill, 2px `#16181F` border, `#FFFDF8` background, 2px inner padding, 2px gap. Two segments (Compact, Tiles), each 28px tall, radius 14, padding 0 14, Bricolage 700 13px. Active segment: background `#16181F`, text `#F4F1EA`. Inactive: transparent, text `#16181F`.
  2. "Scan receipt": secondary button, 36px tall, radius 18, padding 0 16, 2px ink border, `#FFFDF8` background, Bricolage 600 13.5px.
  3. "+ Add section": same as Scan receipt.
  4. "+ Add item": primary button, 36px tall, radius 18, padding 0 18, `#2323FF` background, white text, 2px ink border, hard shadow `3px 3px 0 #16181F`, Bricolage 700 13px.

### "How it works" hint (dismissible)
- `#FFFDF8` background, 2px dashed ink border, radius 14, padding 8px 14px. Same side margins as the page.
- Tag "how it works": `#FFE14D`, 2px ink border, pill, padding 2px 10px, Bricolage 800 11.5px, rotated -3deg.
- Body text: Inter 12.5px/1.45, `#3F3E37`. Copy unchanged from v1.
- "Got it": Bricolage 600 13px, underlined. Hides the hint.

### Shelves
- 12-column grid, gap 14. Default spans: Fridge 6, Freezer 6, Pantry 12. User-set spans (Full / Half / Third) still apply.
- **Under 640px every shelf spans all 12 columns.**
- Shelf card: `#FFFDF8`, 2px ink border, radius 20, padding 10px 12px 18px, column gap 8.
- Shelf header row (gap 8): drag handle ⠿ (14px, `#5E5B52`), name in Bricolage 800 20px with letter-spacing -.02em, count pill (22px tall, min-width 22, `#FFE14D`, 2px ink border, Bricolage 800 11.5px), spacer, edit button (26px circle, 2px ink border, ✎; shows ✓ on `#FFE14D` while editing).
- Edit mode chips: 28px tall, radius 14, padding 0 12, Bricolage 600 12.5px, `#F4F1EA`. "Delete shelf" uses `#FF48B0`.
- Resize grip: 16×16 in the bottom-right corner, inset 8/6px.
- Items are sorted by days until expiry, soonest first. Items with no date go last.

### Item: Compact view
- Grid: `repeat(auto-fill, minmax(230px, 1fr))`, row height 48px, gap 6. One column on phone.
- Row: 2px ink border, radius 12, background white (`#FFF4FA` if expired), overflow hidden, flex.
- Shelf-life strip (left edge): 6px wide, `#F4F1EA`, 2px ink right border. It fills from the bottom: height = days/28 (minimum 8%, 100% if expired). Shown only when days < 28. Colours: ≤3 days or expired `#FF48B0`; ≤7 days `#FFE14D`; otherwise `#2323FF`.
- Content: padding 5px 10px 5px 6px, gap 10.
  - Thumbnail: 34×34, 2px ink border, radius 8, white background, product photo `object-fit: contain`.
  - Name: Bricolage 700 14.5px/1.15, one line with ellipsis. If expired, an "Expired" pill sits underneath: `#FFE0F1` background, `#8A0F55` text, 15px tall, Bricolage 700 10.5px.
  - Quantity: number in Bricolage 800 14.5px, then unit in Bricolage 600 12px `#5E5B52`. Fractions display as ¼ ½ ¾.
  - Checkbox: 16×16, radius 4, 2px ink border. Checked state is `#2323FF` with a white ✓.

### Item: Tiles view
- Grid: `repeat(auto-fill, minmax(130px, 1fr))`, auto row height, gap 8. **Exactly 3 columns on phone.**
- Tile: 2px ink border, radius 12, white background (`#FFF4FA` if expired), column layout, overflow hidden.
  - Photo well: 92px tall, **pure white `#FFFFFF`**, 8px padding, 2px ink bottom border. The packshot uses `object-fit: contain` and is never cropped, matching the product images the app already has.
  - Checkbox: absolutely positioned top 6 / right 6. Same style as Compact.
  - "Expired" tag: absolutely positioned top 6 / left 6, `#FFE0F1` background, 1.5px `#8A0F55` border, `#8A0F55` text, 16px tall, Bricolage 700 10.5px.
  - Text block: padding 6px 8px 7px, gap 2.
    - Name: Bricolage 700 13px/1.15. Clamped to 2 lines with a fixed min-height of 2.3em so tiles line up.
    - Quantity: Bricolage 800 12.5px, unit 600 `#5E5B52`.
  - Shelf-life bar: 5px tall along the bottom, `#F4F1EA` track, 2px ink top border. Width = days/28 (minimum 8%), 100% if days ≥ 28 or expired, 0 if no date. Same colour rules as Compact.

### Empty shelf
A dashed `#BDB6A6` box, radius 12, 48px tall, with the text "Drop items here" in Bricolage 600 13px `#5E5B52`.

## Interactions and behaviour
- **View toggle**: switches every shelf between Compact and Tiles. Save the choice per user (the prototype uses localStorage key `riso-inv-view`). Default is Compact.
- **Click an item** in either view to open the existing item pop-up (400px wide, radius 22, shadow `6px 6px 0 #16181F`, padding 20, overlay `rgba(22,24,31,.4)`). The pop-up content is unchanged from v1.
- **Checkbox**: toggles selection without opening the pop-up. When anything is selected, the sticky bottom bar appears with "{n} selected", Find recipes, Used up, Tossed, Freeze and ×. Behaviour is unchanged.
- **Drag** items between shelves (both views) and drag shelves by the ⠿ handle. Unchanged.
- **Hover**: pointer cursor on items. There are no new hover styles.
- **Responsive**: under 640px, side padding drops to 16, shelves stack full width, the action buttons wrap, Compact goes to one column and Tiles to three.

## State
- `view`: `'compact' | 'tiles'`, persisted.
- Existing: items, shelves (name, span, height), active item, draft item, selection, hint dismissed.
- Viewport width, to apply the under-640px rules (in production, use CSS media queries).

## Design tokens
- Ink `#16181F` · Page `#F4F1EA` · Card `#FFFDF8` · White `#FFFFFF` · Track `#E9E4D8`
- Blue `#2323FF` · Pink `#FF48B0` · Yellow `#FFE14D` · Expired tint `#FFF4FA` · Expired pill `#FFE0F1` / `#8A0F55`
- Muted text `#5E5B52` · Body text `#3F3E37` · Dashed border `#BDB6A6` · Grip `#A39B86`
- Fonts: Bricolage Grotesque (500/700/800), DM Mono (500), Inter (400–700)
- Radii: 4 (checkbox), 8 (thumbnail), 12 (item), 14 (hint, chips), 18 (buttons), 20 (shelf), 22 (pop-up)
- Borders: 2px ink everywhere, 1.5px on the expired tag
- Shadows: `3px 3px 0 #16181F` (primary button), `6px 6px 0 #16181F` (pop-up), `4px 4px 0 #2323FF` (active item)

## Assets
- Product photos: use the app's existing product images (the white-background packshots already in Inventory). In the prototype the photo wells are drag-and-drop placeholders.
- No new icons. The glyphs used are ⠿ ✎ ✓ ×.

## Files
- `page-inventory-desktop.dc.html`: the page (both views, responsive)
- `page-inventory-mobile.dc.html`: phone preview of both views
- `part-header.dc.html`, `part-copy.js`: shared header (reference only)
