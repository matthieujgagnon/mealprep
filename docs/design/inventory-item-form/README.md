# Handoff: Inventory Item Form (Add item + Edit item)

## Overview
One form, two modes, for the Inventory page.
- **Add mode** ("+ Add item"): replaces the old single-row Add item modal. Guided steps, live preview, photo, and a fast path for adding several items.
- **Edit mode** (tapping an item card): replaces the old item detail panel. Same layout, prefilled, with actions for finishing an item.

Build it as **one shared component** (`ItemForm`, `mode: "add" | "edit"`). About 90% is identical; the differences are listed under "Mode differences".

## About the Design Files
`Riso Add Item.dc.html` and `Riso Inventory Item.dc.html` are **design references built in HTML**: prototypes of intended look and behaviour, not production code. Recreate them in the target codebase's existing environment (React, Vue, SwiftUI, etc.) using its patterns and libraries. If none exists, pick the most suitable framework. `support.js` is only the prototype runtime; do not ship it.

## Fidelity
**High fidelity.** Final colours, type, spacing, borders, shadows and interactions. Recreate pixel-accurately with the codebase's components.

## Layout (both modes)

### Desktop modal
- Overlay `rgba(22,24,31,.45)`, click outside closes, scrolls if the modal is taller than the viewport. Overlay padding `48px 24px 0`; modal margin `auto 0 24px`; centred when it fits.
- Modal: width 860 (max 100%), bg `#FFFDF8`, 2px `#16181F` border, radius 26, shadow `8px 8px 0 #16181F`, padding `28px 32px`, column gap 20.
- Close button: 42×42 circle at `top/right -16px`, bg `#FFFDF8`, 2px border, shadow `3px 3px 0 #16181F`, "×" 22/700.
- Body: flex-wrap row, gap 24. Form column `flex: 1 1 380` (gap 20). Side column `flex: 1 1 260` (gap 14). Columns stack below about 700px.
- Footer: sticky to the bottom, bg `#FFFDF8`, top border 2px dashed `#BDB6A6`, padding `16px 0 2px`, row gap 10, buttons 48px tall.

### Phone sheet (390 wide)
Bottom sheet: full width, radius `26px 26px 0 0`, padding `24px 18px 22px`, overlay padding-top 60, margin `auto 0 0`. Columns stack; the side column goes under the form. Small chips are 30–34px tall; raise to 40 or more for touch.

## Header
- **Add**: "Add **item.**" Bricolage Grotesque 800 36/1, -0.03em, "item." in `#2323FF`. Beside it: "ENTER ADDS IT AND KEEPS THE FORM OPEN", DM Mono 500 11, 0.12em, `#5E5B52`.
- **Edit**: item name as a borderless text input (800 36/1, -0.03em, margin-left -12, transparent 2px border; hover border `#BDB6A6`; click to rename). Category on the right, DM Mono 500 11, 0.12em, `#5E5B52` (e.g. "CONDIMENTS, SAUCES & CANNED GOODS").

## Form steps
Each step label: 22×22 circle (bg `#FFE14D`, 2px border, 800 11) + DM Mono 500 11, 0.12em, uppercase. Number steps in order within each mode.

**Add: 1 What is it? · 2 How much? · 3 Where does it live? · 4 Use by**
**Edit: 1 How much is left? · 2 Stored in · USDA · 3 Use by** (name lives in the header)

- **What is it? (Add only)**: input height 56, radius 16, bg `#fff`, 2px border, padding 0 18, 800 24; placeholder "e.g. Chicken breast". Below, while empty, a "RECENT" row of chips (height 30, padding 0 12, radius 15, 700 13, bg `#F4F1EA`, hover `#FFE14D`). Tapping a chip, or typing an exact match, fills quantity, unit, location and use-by from that food's data. Chips can be turned off.
- **How much**: − button (44 circle, bg `#F4F1EA`, 2px border, 700 20, hover `#FFE14D`), quantity input (76 wide, 44 tall, radius 22, centred, 800 20), + button, unit select (flex 1, 44 tall, radius 22, 700 15). Step is 1, or 50 for g and ml; never below 0. Quantity accepts decimals, `1/2`, `1 1/2` and unicode fractions; displays ¼ ⅓ ½ ⅔ ¾ else up to 2 decimals; invalid input reverts. Quick chips (30 tall, min-width 36, radius 15): Add `¼ ⅓ ½ ¾ 1 2 6 12`, Edit `¼ ⅓ ½ ⅔ ¾ 1`. Units: each, lb, oz, g, kg, ml, L, cup, tbsp, tsp, pack, can, bottle, bunch, loaf, bag.
- **Where it lives / Stored in**: grid `repeat(auto-fit, minmax(104px, 1fr))` (Edit uses minmax(150px, 1fr)), gap 8. One card per location with USDA shelf life (Add: the user's shelves; Edit: only the locations that make sense for the item). Card padding `10px 12px`, radius 18, 2px border, name 800 16, range DM Mono 500 10.5. Selected: bg `#2323FF`, text `#fff`, shadow `3px 3px 0 #16181F`. Unselected: bg `#F4F1EA`. Changing location resets use-by to that location's USDA days unless the user set their own date.
- **Use by**: chips (34 tall, radius 17, 700 13): 3 days, 1 week, 2 weeks, 1 month, 3 months, No date. Selected bg `#16181F` text `#F4F1EA`; unselected `#FFFDF8`. Plus a "Pick a date" chip with a 2px dashed border and a native date input. Note below (13/1.5, `#3F3E37`): "Use by Oct 18. USDA estimate for {item} in the {location} ({range})." / "Use by Oct 18. Your date." / "No date. It will sit at the end of the shelf." / "Expired {date}. Toss it or check it before using."
- **Done with it? (Edit only)**: chips 38 tall, radius 19, 700 14, 2px border. "Used up" (hover `#10C95C`), "Tossed" (hover `#FF48B0`), "Freeze" (hover `#FFE14D`; only when the item has a freezer option). Each removes or moves the item and shows a toast.

## Side column (both modes)
- **Preview**: label "HOW IT LOOKS ON THE {LOCATION} SHELF" (DM Mono 11). Then the exact inventory item card: height 88, 2px border, radius 16, bg `#fff`, shadow `4px 4px 0 #2323FF`. Left 12px expiry gauge (bg `#F4F1EA`, right border 2px) filled from the bottom; 68px photo tile; name 800 18/1.15 (2-line clamp, placeholder "Item name" in `#8A8677`); quantity 800 18 + unit 600 14 `#5E5B52`.
  - Gauge height = `max(8, days / 28 × 100)%`; hidden when days is null or 28 or more. Colour: 3 days or less `#FF48B0`, 7 or less `#FFE14D`, else `#2323FF`; no date `#BDB6A6`.
- **Expiry tag** (28 tall, radius 14, 2px border, 800 13): Tomorrow (1 day or less), "{n} days" (under 60), "{n} months", Expired, No date. Bg: no date `#F4F1EA`, 2 days or less `#FF48B0`, 7 or less `#FFE14D`, else `#fff`. Beside it DM Mono 10.5 `#5E5B52`: "SORTED BY EXPIRY" or "LAST ON THE SHELF".
- **Pantry staple toggle**: pill 34 tall, radius 17, "☆ Mark as pantry staple" ↔ "★ Pantry staple" (bg `#FFE14D` when on).
- **Photo panel**: label "PHOTO · OPTIONAL" (Add) / "PHOTO" (Edit). Box with 2px dashed `#16181F` border, radius 16, bg `#F4F1EA`, padding 14. The whole block is a drop target.
  - Empty: "Drop a picture here" (800 15, `#2323FF`); "Upload a photo" button (38 tall, radius 19, 700 14, opens the file picker, images only); "OR"; an image-link input (38 tall, radius 19, 500 14) with a "Use" button. Enter in the input also applies it; only http(s) links are accepted.
  - With photo: 64px thumbnail (radius 12, 2px border), "Change photo" button (34 tall, radius 17, 700 13), "Remove photo" text link (600 13, underlined).
  - The photo shows immediately in the preview card and on the shelf card. Production should upload the file, store it, and save its URL.
- **Edit only**: below the photo panel, a dashed top rule and "{n} of your recipes use {item}. **See them →**" (13.5/1.5, link 600).
- **Add only**: "ADDED THIS TIME · n" tray (bg `#F4F1EA`, 2px dashed border, radius 16, padding `12px 14px`): rows with a 20px `#10C95C` check circle, name 700 14, "qty unit · location" in DM Mono 11, and "Undo" (underlined 600 12).

## Footer
- **Add**: Cancel (becomes **Done** after anything was added) · spacer · **Add and next** (bg `#FFFDF8`, hover `#FFE14D`, 40% opacity while name is empty) · **Add to inventory** (primary: bg `#2323FF`, white, 800 16, padding 0 28, shadow `3px 3px 0 #16181F`; disabled look bg `#BDB6A6`, no shadow).
  - Add and next: adds the item, keeps the modal open, resets name, quantity (1), unit (each), photo and use-by; keeps the chosen location. Enter in the name field does the same.
  - Add to inventory: adds, closes, shows a toast.
- **Edit**: left, small button **Remove (typo or duplicate)** (30 tall, radius 15, 700 12, 2px border, bg `#FFFDF8`, hover `#FF48B0`; for mistakes only, "Used up" and "Tossed" cover normal removal) · spacer · Cancel · **Save changes** (same primary style).
- **Toast**: bg `#FFE14D`, 2px border, rotate -2deg, shadow `4px 4px 0 #16181F`, 800 15, pill, bottom centre, about 2.6s. Copy: "{name} added to {location}", "Changes saved", "{name} marked as used up", "{name} tossed", "{name} removed".

## Mode differences (summary)
| | Add | Edit |
|---|---|---|
| Header | "Add item." + hint | Editable name + category |
| Name step | Yes, with Recent chips | In header |
| Initial values | Empty (qty 1, each, first shelf, USDA days) | Item's saved values |
| Location cards | All shelves | Only valid locations for the item |
| Extra actions | Add and next, tray | Done with it?, recipes link, Remove |
| Primary | Add to inventory | Save changes |

## State Management
Shared: `name`, `qtyText` (string, parsed on commit), `unit`, `loc`, `days` (number or null, days from today), `custom` (true once the user picked a chip or date), `staple`, `photo` (URL), `photoUrl` (link input text).
Add also: `added` (session tray), `opts` (USDA ranges for the matched food).
Edit works on a draft copy of the item; Save commits it, Cancel discards it.
- Choosing a food: set name, qty, unit, ranges; location = its first option; `days` = that option's days; `custom` = false.
- Choosing a location: `days` follows USDA unless `custom`.
- Use-by chip or date: set `days`, `custom` = true. The date picker converts to days from today.
- Closing (×, overlay, Cancel/Done) clears the tray only; added items stay in inventory.
- Data needed: a food database with per-location shelf life (USDA FoodKeeper); recent items; file upload for photos; persistence of name, qty, unit, location, expiry date, staple flag and photo URL.
- Fallback shelf life when the food is unknown: Fridge 14 days, Freezer 90, Pantry 180.
- Suggested: focus the name field (Add) on open and after Add and next.

## Design Tokens
- Colours: ink `#16181F`; paper `#F4F1EA`; card `#FFFDF8`; white `#fff`; blue `#2323FF`; pink `#FF48B0`; yellow `#FFE14D`; green `#10C95C`; muted text `#5E5B52`; body text `#3F3E37`; placeholder `#8A8677`; dashed rule `#BDB6A6`; photo placeholder stripes `#F4F1EA`/`#E9E4D8` at 135deg, 8px bands.
- Fonts: Bricolage Grotesque (500/700/800) for UI; DM Mono (400/500) for labels, 0.1–0.12em tracking, uppercase.
- Borders: 2px solid ink everywhere; dashed for optional or secondary elements.
- Radius: 15–17 chips, 19–24 buttons and inputs, 16–18 cards, 26 modal.
- Shadows: hard offset, no blur: 3px buttons, 4px cards, 8px modal; blue offset for the active card.
- Spacing: 6, 8, 10, 14, 18, 20, 24, 28, 32.
- Focus: 3px `#2323FF` outline, offset 1.

## Assets
No icons or images. Photos are user-supplied (upload or link); the placeholder is the striped tile. Fonts via Google Fonts.

## Files
- `Riso Add Item.dc.html` — Add mode (props: `layout` Desktop modal / Phone sheet, `suggest` on/off)
- `Riso Inventory Item.dc.html` — Edit mode (prop: `layout`). Use "Reset demo" in its header to restore the sample item after removing it.
- `support.js` — prototype runtime only
- Related: `Riso Inventory.dc.html` (the page both open over)
