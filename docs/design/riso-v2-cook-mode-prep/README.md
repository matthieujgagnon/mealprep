# Cook mode: "Before you start" prep page (state 5.0): handoff

Add a new first page to cook mode, shown before step 1 on every recipe. It lists each ingredient that needs work, grouped by job, says how to prepare it, and says which step uses it.

Open `Cook Mode.dc.html` and find state **5.0**: computer and phone, English and French. Everything else on that page is already covered by the main cook mode handoff.

## Where it goes
- `client/src/components/CookMode.jsx`: a new page at index 0, before the recipe's steps. "Start step 1" moves on to the current step 1.
- Styles: new `.cm-prep-*` classes in `client/src/index.css`, next to `.cm-*`.
- Copy: new `cookMode.prep.*` keys in `client/src/i18n/en.js` and `fr.js` (listed below).

## Data
- **Built from the recipe's ingredients:** each needs a prep note (e.g. "diced"), a prep group, and the step(s) that use it.
  - Ingredients with no prep note are left off.
  - If a recipe has none, skip the page and open on step 1.
- **Groups, in this order:**
  - Cut (dice, slice, mince, chop)
  - Measure
  - Squeeze / zest
  - Other
  - Hide empty groups.
- **How line:** a full instruction sentence, e.g. "Dice into 3 cm pieces". It's more than the short note under the ingredient name in "For this step".
- **Do first** (optional, per recipe): oven or pan setup, e.g. "Heat the oven to 220 °C (425 °F) and line a sheet pan." Pull it from the recipe's temperature if there is one.
- **Count:** "7 to prep" counts the rows that are shown.
- **Recipe step 1:** sample recipes whose step 1 is just "Prep" will repeat this page. Consider merging that step into this page.

## Layout: computer (1280)
Uses the same frame as a step: top bar, a `96px · 1fr · 340px` grid with 32px gaps and 32px 40px padding, and the bottom bar.
- **Rail:** an extra first dot, "0" with the label GET READY. It's the current dot: 44px, #2323ff, white text, 3px 3px 0 ink shadow. Steps 1–5 are all upcoming: 30px, surface fill. The rail line is the same 2px dotted line.
- **Middle column, gap 22px:**
  - Eyebrow "BEFORE YOU START · 7 TO PREP": DM Mono 11px, 0.12em, muted.
  - Title "Get everything ready": Bricolage 800 30px.
  - Sub line: Inter 15px/1.45, muted.
  - Each group:
    - **Header:** the group name (DM Mono 11px) on the left and "n ingredients" (muted) on the right, over a 2px dotted line.
    - **Rows:** a grid of `30px · qty · 1fr · auto` with a 12px gap, at least 52px tall, each with a 2px dotted line below.
    - **Row contents:** an empty 26px check circle, the qty (DM Mono 14px, right-aligned), the name (Bricolage 700 17px) with the how line under it (Inter 14px, ink), and the step tag ("STEP 2", DM Mono 10px, muted).
- **Right column:**
  - The photo (250px).
  - Then the **Do first** card: a surface card with a 2px ink border, radius 24px, a 6px 6px 0 shadow and 20px 22px padding. It holds the "DO FIRST" eyebrow and the instruction in Bricolage 700 20px.
- **Bottom bar:**
  - No Previous button.
  - "THEN · STEP 1 · PREP" with a one-line preview of step 1.
  - The blue "Start step 1" button.

## Layout: phone (390)
- **Top bar:** same as a step.
- **Dots row:** 6 dots, with "0" current at 34px. The title "Get everything ready" sits under it.
- **No photo.** The eyebrow and sub line come first, then the **Do first** card (2px ink border, radius 18px, 12px 14px padding, text Bricolage 700 15px), then the groups.
- **Rows:** a grid of `26px · qty · 1fr` with a 10px gap.
  - The qty column is 56px in English and 76px in French.
  - The step tag moves to its own line under the how line.
  - Name 15px, how line 13px, at least 48px tall.
- **Bottom bar:** only the full-width "Start step 1".
- **Height:** the page scrolls.

## Dark mode
Same tokens as the step view: page #000, surface #111115, ink #f4f1ea, muted #9a9aa8, white dotted lines, #2323ff shadows.

## Behaviour
- Tapping a row ticks it: blue circle with a ✓, faded to 0.55 with a strikethrough, like "For this step". Ticks are not required to continue.
- Ticking only marks the row as prepped. It doesn't take anything out of the Inventory; that still happens in the finished view.
- The ticks carry over: an ingredient ticked here shows as ticked in its step's "For this step".

## New copy (EN / FR)
| key | en | fr |
|---|---|---|
| prep.rail | Get ready | Avant |
| prep.eyebrow | BEFORE YOU START · {count} TO PREP | AVANT DE COMMENCER · {count} À PRÉPARER |
| prep.title | Get everything ready | Préparez tout |
| prep.sub | Do these before step 1. Tick each one when it's ready. | Faites ceci avant l'étape 1. Cochez chaque ingrédient une fois prêt. |
| prep.doFirst | DO FIRST | D'ABORD |
| prep.groups.cut / measure / squeeze / other | CUT / MEASURE / SQUEEZE / OTHER | COUPER / MESURER / PRESSER / AUTRE |
| prep.count | {count} ingredient(s) | {count} ingrédient(s) |
| prep.step / steps | STEP {n} / STEPS {list} | ÉTAPE {n} / ÉTAPES {list} |
| prep.then | THEN · STEP 1 · {title} | ENSUITE · ÉTAPE 1 · {title} |
| prep.start | Start step 1 | Commencer l'étape 1 |

The sample how lines and the Do first sentence in the mock are recipe data, not UI copy.
