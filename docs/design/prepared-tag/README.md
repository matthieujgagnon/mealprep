# Handoff: « Plat préparé » / "Prepared meal" tag

## Overview
One tag for ready-made food (a frozen lasagna, perogies, store-bought croissants), used on Inventory items **and** on recipes. It replaces the tag shipped in PR #164 (black pill, DM Mono 9px capitals), which read like a code and did not belong to the app's family of stickers.

The new tag keeps the **black** of PR #164 but rebuilds it as a sibling of the yellow « restes » sticker: same build (Bricolage 800 lower case, 1.5px outline, full radius, slight tilt), **ink fill with cream text**, the opposite tilt (**+3°**, « restes » is −4°) and a small **takeout-box glyph**. No new colour.

Look: Riso v2. Quebec French first, English second. Phone 390, desktop 1280.

## About the design files
These are **design references made in HTML**, not production code. Rebuild them in the app (`client/src`, repo `matthieujgagnon/mealprep`) with its existing components, `index.css` tokens and i18n files.

- `board-prepared-meal-tag.dc.html`: **start here.** Section 1 shows the three options; sections 2 to 6 show the chosen tag in every placement, phone then desktop, at real size. Tweaks: `tag` (`d` | `b` | `c`) swaps the option everywhere; `lang` (`fr` | `en`).
- `part-prepared-tag.dc.html`: the tag itself. Props `size` (`s` | `m` | `l`), `sticker` (tilted or upright), `v`, `lang`. This is the one component to build.
- `support.js`: prototype runtime. Do not port it.

Sample photos are Unsplash stand-ins. In the app, use the Inventory item's product photo and the recipe's photo.

## Fidelity
High fidelity. Colours, type, sizes, positions and copy are final.

---

## The options (section 1)
| | Colour | Shape | Tilt | Verdict |
| --- | --- | --- | --- | --- |
| 1b | Cream `#FFFDF8`, glyph in an ink dot (17:1) | Full pill | −3° | No new colour, but it blends with neutral chips (the « Souper » chip in the recipe pop-out, filter pills). |
| **1d (chosen)** | Ink `#16181F`, cream `#FFFDF8` text and glyph (17:1) | Full pill | +3° | Keeps the PR #164 black, now readable and in the sticker family. Ink also marks active filter pills, but those are 36px buttons in a filter row, never on a photo or card. |
| 1c | Lilac `#CDBBFF` (10.3:1) | Square corners, 4–5px | none | Distinct shape, but close to the Freezer shelf violet `#A56BFF`, and prepared meals often live in the freezer. |

Colours already taken and not reused: blue `#2323FF` (you have it), green `#10C95C` (on the grocery list), yellow `#FFE14D` (leftover), pink `#FF48B0` (today / use soon). Ink is the system's own colour, so nothing new enters the palette. (An orange and a pale sky version were tried and dropped.)

## The tag (1d)
No new token. Fill `--riso-ink-fixed #16181F`, text and glyph `--riso-knob #FFFDF8`, border `--riso-ink` (so in dark mode the black tag keeps a light outline on the black canvas).

**Anatomy**: inline-flex, `align-items:center`, background `#16181F`, text `#FFFDF8`, border `1.5px solid #16181F`, `border-radius:999px`, `box-sizing:border-box`, `white-space:nowrap`. Glyph first, then the word. Bricolage Grotesque 800, `line-height:1`, `letter-spacing:-.005em`, lower case. No shadow.

| Size | Height | Text | Glyph | Gap | Padding (L / R) | Width FR / EN | Used on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **S** | 15px | 9px | 9px | 2px | 3 / 5px | about 75 / 85px | Inventory tile and compact row, Planner cards (phone 104 and desktop), item pop-up photo |
| **M** | 18px | 10.5px | 11px | 3px | 5 / 7px | about 92 / 104px | Recipe cards, bento tile, Planner search cards |
| **L** | 22px | 12px | 13px | 4px | 6 / 9px | about 108 / 122px | Recipe pop-out chip row, label of the item pop-up switch |

**Sticker vs upright**: on top of a photo or straddling a card edge, the tag is a sticker: `transform: rotate(3deg)`, `pointer-events:none`. In a line of text or chips (compact row, pop-out chip row, switch label) it is upright.

**Glyph**: a takeout box, line style. 16×16 viewBox, `stroke: currentColor`, stroke-width 1.7, round caps and joins, no fill:
```
<path d="M2.5 6.5h11l-1.6 7.5H4.1z"/>
<path d="M2.5 6.5 4.6 3.6h6.8l2.1 2.9"/>
<path d="M6.1 3.6c.4-2 3.4-2 3.8 0"/>
```
Decorative: `aria-hidden="true"`. The word is the accessible name.

**Fit at 104px**: S is about 75px in French and 85px in English, so it fits the phone Planner card (100px inside the border) in both languages. Do not truncate it; if a future translation is longer, drop the glyph at S before shrinking the text.

## Placements

### 1. Inventory (section 2)
- **Tile** (tiles view, phone 3 columns, desktop 150px): S sticker, absolutely positioned `left:6px; bottom:6px` inside the white photo well (92px). Top-left stays for « Expiré », top-right for the checkbox. Replaces the old `.inv-card-leftover-tag.prepared`.
- **Compact row** (48px): S upright, under the name, where « Expiré » goes. Both present: flex row, gap 4, Expired first. Row height unchanged.
- Leftovers keep the yellow « restes » tag. An item is never both.

### 2. Inventory item pop-up (section 3)
- The switch label **is the tag** (L, upright), so the user sees exactly what the item will carry. Help text under it unchanged (Inter 12.5px `#5E5B52`).
- Switch: unchanged from `prepared_meal` (48×28, off `#E9E4D8`, on ink `#16181F`). Off `#E9E4D8`, on ink, as before.
- When on, the S sticker also shows on the pop-up's product photo (`left:-6px; bottom:-8px`, overlapping the frame corner), and the category caps read « … · PLATS PRÉPARÉS ».
- The whole row stays the tap target (≥ 44px).

### 3. Planner board (section 4)
A planned prepared meal is now a **photo card**, like a recipe, instead of today's text-only note card (`PlannerNoteCard` with `isPrepared`). It needs the Inventory item's photo, name and amount.
- **Phone, 104×104** (radius 14): photo well 50px, background `#FFFFFF`, product photo `object-fit:contain`, padding `4px 10px`, 2px ink bottom border. Name Bricolage 800 12px (2 lines), amount DM Mono 9.5px (« 4 PORTIONS », « 1 SAC »).
- **Desktop cell, 156×150** (radius 16): photo well 58% height, `#FFFFFF`, contain, padding `8px 14px 12px`. Title Bricolage 800 12.5px, padding `12px 9px 8px`. × button unchanged.
- **Border**: `3px solid #16181F`, the same treatment as the leftover's `3px solid #FFE14D` (a recipe card has 2px). (Past days: the usual faded past style.)
- **Sticker**: S, where « restes » goes. Phone `right:4px; top:36px`. Desktop `right:5px; top:calc(58% - 10px)` (straddles the photo's bottom edge).
- No photo: the striped placeholder from the recipe card (`#E9E4D8` / `#DDD6C6`, 135°).
- Legend under the board: show the S tag in place of the old ink swatch, text unchanged (« Plat préparé, pas à acheter »).
- The week calendar preview (`WeekCalendar.jsx`, `Pill tone="ink"`) uses the S tag too.

### 4. Recipes (section 5)
A recipe can be marked prepared (frozen pizza, croissants to warm up). The recipe data needs the same `isPreparedMeal` flag.
- **Recipe card** (Recipes page; desktop 285px, phone 2 columns): M sticker on the photo, top-left, inset 8px (6px phone). That corner is free on the Recipes variant. On Makeable, it goes first in the flag stack (max two flags still applies; it counts as one).
- **Bento tile**: M sticker centred above the title, inside the bottom band (flex column, gap 10). Same on every tile size.
- **Recipe pop-out header** (desktop 680, phone full width): L, upright, first chip in the row under the title, before the yellow « ⏱ 15 min | 4 portions » chip and the « Souper » chip.

### 5. Planner search (section 6)
- **« Déjà prêt » prepared card**: M sticker `top:12px; left:12px` (10px phone), rotated +3°, replacing the earlier cream sticker. White product well and info row unchanged from `prepared_meal`.
- **Leftover card**: unchanged (yellow M « restes », −3°).
- **Recipe card marked prepared** (Recettes results): M sticker at the same spot, replacing the `MEAL · TIME` caps.

## Copy (FR · EN)
- plat préparé · prepared meal (the tag, all sizes, lower case)
- Plat préparé · Prepared meal (switch `aria-label`, legend)
- Se mange tel quel, sans recette. Se planifie comme un repas. · Eaten as is, no recipe. Plan it like any meal.
- CONGÉLATEUR · PLATS PRÉPARÉS · FREEZER · PREPARED MEALS
- 4 PORTIONS · 4 PORTIONS — 1 SAC · 1 BAG
- restes · leftovers (unchanged)

i18n: change `preparedMeal.tag` from « PLAT PRÉPARÉ » / "PREPARED MEAL" to « plat préparé » / "prepared meal" (or render `planner.prepared`, which is already lower case, and retire the caps key).

## Design tokens
Ink `#16181F` · Paper `#F4F1EA` · Card `#FFFDF8` · Well `#FFFFFF` · Track `#E9E4D8` · Yellow `#FFE14D` · Blue `#2323FF` · Green `#10C95C` · Pink `#FF48B0` · Muted `#5E5B52`. Fonts: Bricolage Grotesque 800 (tag), DM Mono, Inter.

## Open questions
- Should a planned prepared meal's card show where it is stored (« CONGÉL. ») instead of the amount on the phone card?
- When the last portion is eaten, should the Planner card keep the photo (it is gone from Inventory)? Suggestion: keep a copy of the photo URL on the planner entry.
