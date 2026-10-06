# Planner mobile v2: brief for the PM (Oct 6)

Project: The Matt Mo Cookbook, Riso v2
Where to look: **Riso_V2_Page_Planner_Mobile_v2.dc.html** (11 phones on one canvas, ids 1a to 1l). Every phone is interactive. Spec and tokens: **README.md** in this folder. Developers: paste the README plus the two `.dc.html` files into Claude Code.

## What this is
The phone Planner (390 px) redone from the earlier three-day version, brought up to date with what the Planner does now. French (Québec) first; English strings are in the README.

## What changed from the earlier version
- **No grocery button.** The list builds itself when meals are planned. The bottom bar is gone.
- **Meal names** (Déjeuner, Dîner, Souper) are small, light grey labels between the rows. They stay at the left edge while the cards slide.
- **Page sticker** (yellow, tilted) moves the board three days at a time; swiping does the same. Page 1: forward only. Page 2: both. Page 3: back only.
- **« cette semaine » pill** is smaller. It turns blue while the calendar is open, like desktop.
- **Card states:** blue border = already have everything (no badge, no shadow). Yellow border + « restes » tag = leftovers. A plain solid « Rien de prévu » card is clearly different from the dashed « + ajouter » slot.
- **« Vider »** is a tiny link under each future day that has something planned.
- **Weekend:** no tag on the board. A dotted pink band marks the days. Settings are in the calendar under « Fin de semaine » (on/off, days, presets, « la veille au souper »).
- **Calendar:** three dashes per day (one per meal), today pink, shown week yellow. Tapping a day shows its meals under the row. Footer: « Aller à cette semaine » and « ↺ Copier la semaine dernière ».
- **Tapping an empty slot** opens a small card under it with desktop colours: Recette (blue), Note (yellow), Rien de prévu (white; first tap asks « Confirmer »).
- **Tapping a recipe** opens a card with the photo and the same colour code: Cuisiner (blue), Utiliser comme base (yellow), Remplacer (white).
- **Search** is the same bar as desktop at the bottom of the page, with « Parcourir ». Open, it shows the finder filters and results two across. No « Ajouter des recettes » title.
- **Dragging a card:** the search bar is replaced by a trash zone so a recipe can be removed by dropping it there.

## Decisions to confirm
1. **Title:** « Le menu de la semaine. » (1a, wraps to two lines) or « La semaine à venir. » (1b, one line). Both are shown.
2. **Sticker labels** read « jeu–sam → » on page 1 and « ven–dim → » on page 2, because the pages are lun–mer, jeu–sam, ven–dim. The original brief said « jeu – dim → ».
3. **Rien de prévu, first tap:** it turns black with « ✓ Confirmer », not blue, because Recette is now blue.
4. **Meal labels** are intentionally very faint (`#7A7668`, light weight). Contrast is below the usual 4.5:1.
5. **Search filters:** Repas, Protéine and « Cuisiner avec… » are visual only in this prototype; they open the shared finder menus in the real app.

## Not done or only drawn
- Drag and drop is a still image (1k, 1l). The gesture, edge paging while dragging and the drop-to-trash behaviour need to be built natively.
- Sample data only (recipes, plans for three weeks, calendar dashes).
- Week arrows show an empty board for weeks with no sample data.
- The finder results and chips use the sample list, not the real recipe finder.

## Files
- `Riso_V2_Page_Planner_Mobile_v2.dc.html`: canvas.
- `Riso_V2_Part_PlannerMobilePhone.dc.html`: one phone (props `scene`, `title`).
- `README.md`: full spec, state, tokens, copy FR/EN.
- `support.js`: prototype runtime only.
