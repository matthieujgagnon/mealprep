# Handoff: Planner header (title, week picker, "this week" pill)

## Overview
The strip above the Planner board: page title, week switcher with a month-calendar picker, the yellow "this week" pill, and "Copy last week". Also covers the expanded board legend.

## About the Design Files
The files here are **design references built in HTML**: prototypes showing look and behaviour, not production code. Recreate them in the target codebase (React, Vue, SwiftUI, etc.) with its own patterns and libraries. If there is no environment yet, pick the most suitable framework.

## Fidelity
**High fidelity.** Final colours, type, spacing and interactions. Recreate pixel-accurately. Sample data is placeholder (see "Data").

## Title change
- Old: "The week **ahead.**" (FR "La semaine **à venir.**")
- New: "This week's **menu.**" Last word in blue `#2323FF`.
- The title is static. It still reads "This week's" when another week is selected (open question: change it, for example to the date range).
- FR translation not yet written.
- Size: Bricolage Grotesque 800, **60px** desktop / **40px** phone, line-height .95, letter-spacing -.035em, no wrap. Same as the Recipes page title.

## Screen: Planner header (desktop, 1280 max width)
Row: `display:flex; align-items:flex-end; justify-content:space-between; gap:24px`. Side padding 40px (18px phone). Row sits directly above the board; header has `margin-bottom:-9px` so the gap to the board border is about 24px.

Left: title. Right (bottom-aligned, `padding-bottom:2px`), `flex; gap:8px; align-items:center`:
1. **Prev arrow**: 32×32 circle, 2px ink `#16181F` border, bg `#FFFDF8`, glyph ‹ (Bricolage 800 15px). Hover bg `#FFE14D`.
2. **Date pill**: height 34, padding 0 13, radius 17, 2px ink border, shadow `2px 2px 0 #16181F`, Bricolage 800 13px, label "Oct 5 – 11" + caret ▾ (9px). Closed: bg `#FFFDF8`, text ink. **Open (selected): bg `#2323FF`, text white, caret ▲.**
3. **Next arrow**: same as prev, glyph ›.
4. **"this week" pill**: yellow `#FFE14D` sticker, rotate(-4deg), height 22, padding 0 10, radius 11, 2px ink border, Bricolage 800 11.5px. When viewing another week it reads "↩ this week" and jumps back on click.

Week label rule: same month "Oct 5 – 11"; across months "Sep 28 – Oct 4". Weeks start Monday.

## Calendar popover (opens under the date pill)
- Anchored to the pill, centred (`left:50%; translateX(-50%)`), 14px below, width 350, bg `#FFFDF8`, 2px ink border, radius 26, shadow `6px 6px 0 #16181F`, padding 18, column gap 10. Caret: 14px square rotated 45deg at top-centre, same border on top/left.
- Click outside closes it (transparent full-screen backdrop, z 40; popover z 50).
- **Header**: month and year, lowercase, Bricolage 800 28px, letter-spacing -.03em, year in blue. To the right, two 40×40 circle **month arrows** (‹ ›). These change the displayed month only. The outer arrows next to the pill always change the week.
- Weekday row: M T W T F S S, DM Mono 500 11px, letter-spacing .08em, colour `#5E5B52`.
- Rows are weeks (5 or 6). Clicking a row selects that week and closes the popover. The selected week's row has bg `#FFE14D`, radius 16.
- Day cell: 30×30 number tile (radius 10, Bricolage 800 15px) with three 8×4 dashes below (one per meal slot: breakfast, lunch, supper). Filled dash = slot planned (blue `#2323FF`; ink inside the selected row). Empty dash `#D8D4C8` (`rgba(22,24,31,.18)` in the selected row). Days outside the month are `#A8A394`.
- Today: tile bg `#FF48B0` with 2px ink border.
- Legend row: blue dash "MEALS PLANNED", pink square "TODAY" (DM Mono 11px, letter-spacing .1em).
- Footer: dashed top border (2px `#BDB6A6`), 16px padding-top, two equal buttons, gap 10, height 42, radius 21, 2px ink border, Bricolage 700 14px: **"Go to this week"** and **"↺ Copy last week"** (hover `#FFE14D`). After copying the label shows "✓ Copied" for 1.6s.

### Day hover preview (desktop)
Hovering a day shows a card to the **left** of the popover (absolute, `right:calc(100% + 16px); top:0`, width 280, same card style as the popover, no pointer events). Content: title "Tue, Oct 6" (Bricolage 800 20px) with a DM Mono count at right ("2 PLANNED" or "NOTHING PLANNED"), then three rows (BREAKFAST, LUNCH, SUPPER): 48×48 image tile (radius 12, 2px border; dashed and empty if nothing planned), slot label (DM Mono 10.5px), recipe name (Bricolage 800 14px). Leftover meals get the rotated yellow "leftover" tag. Hovered day gets a 2px blue outline.
Images are placeholder tiles in the prototype. Use real recipe photos.

### Phone (below 768px)
- Title 40px; header stacks (title above controls), side padding 18px.
- Popover: left edge aligned with the screen padding, width `min(350px, 100vw - 36px)`, caret moved to sit under the pill.
- No hover. **Tapping a day** shows the same preview card **directly under that day's week row** (inline, bg `#F4F1EA`, 42px tiles) with a "Show this week" button. Rows do not select the week on tap on phone.

## Board changes on phone
- Shows **three days at a time**. Paging offsets are days 0, 3, 4 (Mon–Wed, Thu–Sat, Fri–Sun, so every page has three days).
- Nav row at the top of the board: ‹ round button, label "MON 5 – WED 7" (DM Mono 12px, letter-spacing .12em), yellow › round button. 36px circles; dimmed to 35% at either end.
- Day columns are sized to fit exactly three: `colW = floor((viewport - 42 - 96) / 3)` (84px at 390). Meal labels (Breakfast/Lunch/Supper, 12.5px) are a sticky 56px first column with a solid board-coloured background so scrolled columns slide under it. Scroll is programmatic (`scrollLeft = offset*(colW+gap) + weekend offset`), smooth, overflow hidden.

## Legend under the board (all sizes)
Order, each swatch 22×16 with label (Inter 500 13px, gap 22px between items, wraps):
1. Planned meal (white card, thick ink top)
2. Ingredients on hand, nothing to buy (blue 2.5px outline `#2323FF`)
3. Leftovers, nothing to buy (yellow "leftover" tag)
4. Note (cream `#F4F1EA`, ink border)
5. Empty slot (dashed `#BDB6A6`)
6. Today (pink `#FF48B0`)
7. Weekend (dotted pink border, weekend fill). Label is just "Weekend" (FR "Fin de semaine"), without the day list.
Dashed top border `1.5px #BDB6A6`, 16px padding-top, 10px margin-top.
Note: the board's meal cards do not yet draw the blue outline. Apply it to meals whose ingredients are all on hand.

## State
- `sel`: selected week offset from the current week (0 = this week).
- `open`: popover open. `mo`: displayed month offset (set from the selected week when opening).
- `hov`: hovered/tapped day offset or null. `copied`: copy feedback flag.
- Phone board: `pg` page index 0 to 2.
- Needs real data: planned meals per day/slot (names, photos, leftover flag), the selected week's dates, a copy-last-week action.

## Design tokens
- Ink `#16181F`; paper `#F4F1EA`; card `#FFFDF8`; blue `#2323FF`; yellow `#FFE14D`; pink `#FF48B0`; muted `#5E5B52`; rule `#BDB6A6`; empty dash `#D8D4C8`; out-of-month `#A8A394`.
- Fonts: Bricolage Grotesque (500/600/700/800), DM Mono (500), Inter (400 to 700).
- Radii: 10 (day tile), 12 to 18 (cards), 26 (popover), 999 (pills). Borders 2px ink. Hard shadows: `2px 2px 0` pill, `6px 6px 0` popover.

## Assets
No images or icons. Preview tiles are placeholders. Glyphs ‹ › ▾ ▲ ↺ ✓ are text.

## Files
- `Riso_V2_Page_Planner_Header.dc.html`: the header and calendar (desktop and phone).
- `Riso_V2_Page_Planner_Desktop.dc.html`: page that composes header + board.
- `Riso_V2_Page_Planner_Mobile.dc.html`: phone frame (390 wide) showing the same page.
- `Riso_V2_Part_PlannerWeekend.dc.html`: the board (hide-title option, legend, phone paging).
- `Riso_V2_Page_Planner_DatePicker_Options.dc.html`: earlier picker variations, for reference only.
