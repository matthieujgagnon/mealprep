# Handoff: Planner, mobile v2 (Riso v2)

## Overview
Phone Planner (390 px) of The Matt Mo Cookbook. Same structure as the earlier three-day version, brought up to date: pinned meal names, three-day pages with a sticker that advances them, a calendar with the weekend settings, inline slot cards, a search panel at the bottom, and long-press drag. Copy is Québec French first; English is in the table at the end.

## About the design files
`.dc.html` files are **HTML design references**: they show look and behaviour, not production code. Recreate them in the target codebase with its own patterns. `support.js` is only the prototype runtime.

## Fidelity
High fidelity. Colours, type, radii, borders and copy are final. Sample data is placeholder.

## Files
- `Riso_V2_Page_Planner_Mobile_v2.dc.html`: canvas with 11 phones (1a to 1k), listed below.
- `Riso_V2_Part_PlannerMobilePhone.dc.html`: one fully interactive phone. Props: `scene` (starting state) and `title` (`menu` | `avenir`). All data and logic are in its `Component` class.
- `support.js`: prototype runtime.

| id | scene | shows |
|---|---|---|
| 1a | `p1` | Page 1 (lun – mer, today), title « Le menu de la **semaine.** » |
| 1b | `p1`, `title=avenir` | Same page, title « La semaine **à venir.** » (pick one) |
| 1c | `swipe` | Mid-swipe: cards slide under the pinned meal names |
| 1d | `p2` | Page 2 (jeu – sam), weekend band, both stickers |
| 1e | `p3` | Page 3 (ven – dim), back sticker only |
| 1f | `cal` | Calendar open, a tapped day showing its meals under its row |
| 1g | `calwk` | Same calendar scrolled to « Fin de semaine » and the footer buttons |
| 1h | `slot` | Empty slot tapped |
| 1i | `rec` | Planned recipe tapped |
| 1j | `search` | Search panel open |
| 1k | `drag` | Card held and dragged to another slot; the bottom bar turns into a trash zone |
| 1l | `trash` | Card held over the trash zone (hover state) |

## Changes from the earlier screenshot (decisions made)
- No « Créer la liste d'épicerie » button and no bottom bar. The grocery list builds itself when meals are planned.
- Already have (all ingredients on hand): 3 px `--blue` border only. No ✓ badge, no shadow.
- Leftovers: 3 px `--yellow` border plus the yellow « restes » tag.
- « Rien de prévu »: a plain solid card (`--card`, 2 px ink border, muted text). Different from the dashed empty slot and from the note card.
- « Vider »: tiny mono link under each day that has something planned. Not on past days.
- Weekend: no tag on the board. A dotted pink band (fill `rgba(255,72,176,.08)`, 2.5 px round dots) surrounds the weekend days. With « la veille au souper » the band also takes in the previous day's Souper cell (L-shaped outline). Settings live in the calendar.
- « cette semaine » pill is smaller than before: 32 px tall, rotated −3°, Bricolage 800 13px.

## Layout (top to bottom)
1. **Status bar** 44 px, then the **top block**: logo « matt mo cookbook », yellow avatar, pill nav (Planificateur active). Unchanged from the earlier version.
2. **Title block** (padding 12 14 0, gap 6): date range in DM Mono 12px (`5 – 11 OCTOBRE`), then the title (Bricolage 800 38px/36px, −.035em, last word(s) in `--blue`). « Le menu de la / **semaine.** » is two lines; « La semaine **à venir.** » is one.
3. **Controls row** (40 px, gap 6): ‹ round button (40 px), week pill, › round button, then right-aligned stickers.
   - Pill opens the calendar (▾ / ▴). While the calendar is open the pill turns `--blue` with white text, like desktop. When another week is shown it reads the range (`12 – 18 oct.`).
   - ‹ › change week. They always move one week.
4. **Page stickers** (yellow, 1.5 px border, radius 999, Bricolage 800 11.5px, rotated ±3°, tap area 40 px high). They advance the board by page:
   - Page 1: `jeu–sam →`
   - Page 2: `← lun–mer` and `ven–dim →`
   - Page 3: `← jeu–sam`
   First page forward only, last page back only, middle both. Swiping the board does the same.
5. **Board** (8 px under the controls). Day tiles, three meal rows, « Vider » row.
6. **Search panel** at the bottom of the page, after a dashed rule.

## Board
- **Pages** show 3 days: offsets 0, 3, 4 (lun–mer, jeu–sam, ven–dim), so every page has three days.
- **Geometry**: day column 104 px, gap 8 (step 112), 14 px left margin. Three columns fit and about 40 px of the next day peeks at the right edge (and the previous day at the left while sliding). The track moves with `translateX(-offset × 108 + dragDx)`; release past 50 px changes page; transition `.28s cubic-bezier(.3,.7,.3,1)`, none while dragging.
- **Meal names**: Déjeuner, Dîner, Souper are very quiet labels (DM Mono 400 11px, `#7A7668`, not bold, 18 px line) sitting between the sections, directly above each row of cards. They stay at the left margin (x = 14) while the cards slide left and right, so you always know which row you are in. They do not move with the track. Row tops shift when an inline card opens, and the labels follow.
- **Day tile**: 100×44, radius 14. Day abbreviation DM Mono 10px over date Bricolage 800 18px. Today: `AUJ.` on `--pink`, 2 px ink border, `3px 3px 0` shadow. Past: grey `#8A8677`.
- **Cards** 100×104, radius 14:
  - Recipe: `--card`, 2 px ink border, photo 50 px (2 px bottom border), name Bricolage 800 12px (2 lines max), time DM Mono 9.5px.
  - Note: `--paper`, 2 px ink border, « ✎ NOTE » over the text.
  - Rien de prévu: see above. Empty: 2 px dashed `--rule`, « + ajouter » in `--blue`.
  - Past days: 60% opacity, photo greyscale, 1.5 px `--rule` border. Not tappable.
- **Vider row**: 26 px, DM Mono 10.5px, underlined, `#8A8677`.

## Calendar (opens from the pill)
- Backdrop `rgba(22,24,31,.45)` from under the top block. The controls row stays above it.
- Panel: from y = bottom of controls row + 10, left/right 14, bottom 14. `--card`, 2 px border, radius 24, shadow `6px 6px 0`, padding 14, scrolls inside. Caret under the pill.
- Header: month in Bricolage 800 26px with year in blue; 40 px ‹ › month arrows (panel only).
- Weeks are rows (Monday first). Each day is a 34×26 tile with **three 8×4 dashes** under it, one per meal, filled when planned (`--blue`; `--ink` in the yellow row). Empty dash `#D8D4C8`. Today: pink tile with 2 px ink border. The shown week's row: `--yellow`, radius 16. Days outside the month are `#A8A394`.
- Tapping a day opens a card right under its row (`--paper`, 2 px border, radius 16): « Jeudi 8 octobre », count (« 2 PRÉVUS »), three lines (DÉJ. / DÎNER / SOUPER) with a 34 px thumbnail and the name, and a yellow « Voir cette semaine » button. Tapping the day again closes it.
- **Fin de semaine** section (after a dashed rule): on/off switch; « JOURS · summary »; seven 44 px day buttons (L M M J V S D, ink when on); switch « la veille au souper »; presets `Ven. soir – dim.`, `Sam. – dim.`, `Dim. – lun.`. Choices are kept between visits.
- Footer: « Aller à cette semaine » (yellow) and « ↺ Copier la semaine dernière » (`--card`). After copying the label reads « ✓ Copié » for 1.6 s.

## Slot and recipe cards (inline, under the row)
Both open directly under the tapped slot's row and push the rows below down. Width 362, `--card`, 2 px border, radius 20, `4px 4px 0` shadow, with a notch pointing at the slot. The slot gets a 2 px blue outline while open. ✕ closes.
- **Empty slot** (112 px): header « MER 7 · DÉJEUNER », then three tiles (flex, 2 px border, radius 14, glyph over label, Bricolage 800 13.5px) with the desktop colours: **+ Recette** `--blue` with white text (opens the search panel aimed at this slot), **✎ Note** `--yellow`, **○ Rien de prévu** `--card`. First tap on Rien de prévu turns it `--ink` with « ✓ Confirmer » and a `3px 3px 0 --pink` shadow (not blue, which is already Recette); second tap confirms. Closing resets it.
- **Planned recipe** (150 px): 64 px photo, slot label, name (Bricolage 800 17px), time and status (`RIEN À ACHETER`, `2 À ACHETER`, `DÉJÀ EN MAIN`, `RESTES`). Three tiles in the same format and colour code as the empty-slot card (52 px, 2 px border, radius 14, glyph over label): **▶ Cuisiner** `--blue` / white (primary action, same as Recette), **↳ Utiliser comme base** `--yellow` (secondary, same as Note), **⇄ Remplacer** `--card` (neutral, same as Rien de prévu; opens the search panel aimed at this slot).

## Search panel
Same search bar as desktop, no title above it: one pill (`--card`, 2 px border, radius 999, `3px 3px 0` shadow) holding the input « Chercher une recette » and a blue « Parcourir » button (yellow « Fermer » when open). When a slot is targeted a yellow chip « mer · Déj. ✕ » appears at the left of the pill; ✕ clears the target. Open: the dashed strip under the bar (« AVEC… », « + Cuisiner avec… »), then filter chips (36 px, 2 px border), count (`12 RECETTES`), then results **two across** (photo 84 px, name, time, `Rien à acheter` in blue or `2 à acheter`). Tapping a result plans it in the targeted slot, or the next empty slot from today forward.
Chips: Faisable maintenant, 1 ou 2 à acheter, Expire bientôt, Repas ▾, Protéine ▾, Rapide. Active = `--blue`. In the prototype only the first three, Rapide (≤ 30 min) and the text search filter; Repas, Protéine and Cuisiner avec… are visual only (they open the shared finder menus in the real app).

## Long-press drag (1k, 1l)
While a card is held, the search bar at the bottom is replaced by a **trash zone**: a 84 px strip (`--paper`, 2 px top border) with a 52 px pill, dashed ink border, trash glyph and « Déposer ici pour retirer ». When the card is over it the pill turns `--pink`, solid border, `3px 3px 0` shadow, « Relâcher pour retirer ». Dropping removes the recipe from its slot (the slot becomes empty). The search bar returns when the drag ends.

Holding a card lifts it: rotated −4°, scale 1.05, `6px 8px 0` ink shadow, following the finger (finger shown as a pink 48 px dot). The origin shows a faded dashed ghost. The target slot gets a 3 px `--pink` outline and a light pink fill. Dropping on a filled slot swaps the two. The prototype shows this state only; build the gesture natively. Dragging near the left or right edge should switch pages.

## State
`page` 0–2, `dx` (live drag), `weekOff` (0 = this week), `calOpen`, `calM` (month shown), `calSel` (tapped day), `wk` `{on, days[7], eve}`, `slot` / `rec` (open inline card), `arm` (Rien de prévu confirm), `search`, `filters`, `q`, `plans[weekOff][meal][day]`.
Plan cell encoding in the prototype: `''` empty, `'-'` rien de prévu, `'n:text'` note, `'key'` recipe, `'key*'` already have, `'key~'` leftovers.

## Tokens
`--paper #F4F1EA`, `--card #FFFDF8`, `--ink #16181F`, `--ink-soft #3F3E37`, `--ink-muted #5E5B52`, `--track #E9E4D8`, `--rule #BDB6A6`, `--blue #2323FF`, `--pink #FF48B0`, `--yellow #FFE14D`, empty dash `#D8D4C8`, past text `#8A8677`, out-of-month `#A8A394`.
Fonts: Bricolage Grotesque 500/700/800, DM Mono 400/500, Inter 400–700. Borders 2 px ink (1.5 px stickers and past cards). Hard shadows 2–3 px on small pieces, 4 px inline cards, 6 px calendar. Radii 14 cards, 20 inline cards, 24 calendar, pills = height ÷ 2. Minimum tap size 40–44 px except the recipe cards (the whole card is the target) and « Vider ».

## Copy (FR → EN)
| FR | EN |
|---|---|
| Le menu de la semaine. / La semaine à venir. | This week's menu. / The week ahead. |
| cette semaine | this week |
| jeu–sam → / ← lun–mer | Thu–Sat → / ← Mon–Wed |
| Déjeuner / Dîner / Souper | Breakfast / Lunch / Supper |
| AUJ. | TODAY |
| + ajouter | + add |
| restes | leftovers |
| ✎ NOTE | ✎ NOTE |
| Rien de prévu / Confirmer | Nothing planned / Confirm |
| Vider | Clear |
| Recette / Note | Recipe / Note |
| Cuisiner / Utiliser comme base / Remplacer | Cook / Use as a base / Replace |
| Fin de semaine | Weekend |
| la veille au souper | the evening before (supper) |
| Voir cette semaine | Show this week |
| Aller à cette semaine | Go to this week |
| ↺ Copier la semaine dernière / ✓ Copié | ↺ Copy last week / ✓ Copied |
| REPAS PRÉVUS / AUJOURD'HUI | MEALS PLANNED / TODAY |
| Chercher une recette / Parcourir / Fermer | Search a recipe / Browse / Close |
| Faisable maintenant / 1 ou 2 à acheter / Expire bientôt / Rapide | Ready now / 1 or 2 to buy / Expiring soon / Quick |
| Rien à acheter / 2 à acheter | Nothing to buy / 2 to buy |
| AVEC… / + Cuisiner avec… | WITH… / + Cook with… |

Format dates with the `fr-CA` locale.

## Assets
Photos are Unsplash stand-ins; use each recipe's own cover. No icons: ‹ › ▾ ▴ ✕ ✎ ✓ ↺ are text.
