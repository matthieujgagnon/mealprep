# Cook mode, design 2c: handoff

Rebuild the step view in `client/src/components/CookMode.jsx` and its `.cm-*` styles in `client/src/index.css` to match `Cook Mode.dc.html` (states 5.1 to 5.3). The finished view (5.4) is redesigned: see "Finished view" below. It renders inside `Cook Mode.dc.html` from `Cook Mode Finished.dc.html`. Copy keys already exist in `client/src/i18n/en.js` and `fr.js` (`cookMode.*`).

## Layout
- **Computer (1280):** a three-column grid, `96px | 1fr | 340px`, gap 32px, padding 32px 40px.
  - Left: the step rail.
  - Middle: the step.
  - Right: the photo (250px tall, radius 20px) above the timer, gap 28px.
- **Phone (390):** one column, padding 16px 18px.
  - Under the top bar: the step dots in a row, with the step title (800 18px) below them.
  - Then, 20px apart: a 60px photo strip (radius 16px), "STEP 2 OF 5", the step text, "For this step", the timer.
  - "STEP 2 OF 5" sits 8px above the text.

## Top bar
- **Computer:** title and meta, the other-step timer chip when one runs, Keep screen on, and × at the end.
- **Phone:** × first, then the title. The old segment bar is removed in both.

## Step rail
- Numbered dots joined by a line. Done dots are ink with ✓, the current dot is #2323ff with a 3px ink shadow, and future dots are surface with a number.
- Sizes: computer 30px (current 44px), phone 24px (current 34px).
- Computer only: labels under each dot in DM Mono 500 10px, uppercase. The current label is in ink, the others muted.

## Step
- Title (computer only): Bricolage 800 30px.
- Text: Bricolage 500, 34px on a computer and 19px on a phone, line-height 1.32.
- Split the step into paragraphs wherever a sentence ends and the next one starts with a capital letter, with one blank line between them. Render with `white-space: pre-line`.
- "For this step" header with an "n / total" count on the right.
- Ingredient rows: a grid of `30px | qty | 1fr`.
  - Columns: the 26px check circle, the quantity right-aligned in DM Mono, then the name in Bricolage 700.
  - The prep follows the name in weight 500, muted: "chicken thighs, diced".
  - A checked row drops to 0.55 opacity and is struck through.
  - Qty column: 80px on a computer and 62px on a phone. French needs 104px and 86px.

## Lines
Every separator is `2px dotted #bdb6a6`: the rail line, under the phone step header, above "For this step", and between the ingredient rows. In dark mode they are `#f4f1ea`.

## Timer
- **Light:** a #ffe14d card with a 2px ink border and radius 24px. Shadow 6px 6px 0 ink on a computer, 5px 5px 0 ink on a phone.
- **Dark:** a #16181f card with #ffe14d type and border and no shadow. The main button is #16181f with #ffe14d text and a 2px #ffe14d border; "+1 min" is #ffe14d with ink text.
- **Phone:** the timer is shown only on steps that have one. Label and time on top; under them a row with Start/Pause filling the width and "+1 min" at its own width (gap 6px, 44px tall).

## Bottom bar
- **Computer:** ← Previous, then Up next (label and one line, ellipsis), then Next step →.
- **Phone:** a 56px ← square, with Next filling the rest of the row.
- **Last step:** Next uses `cookMode.finish` and Up next is hidden.

## Finished view (`Cook Mode Finished.dc.html`)
Replaces the done view in `CookMode.jsx`. Open `Cook Mode Finished.dc.html` (or state 5.4 in `Cook Mode.dc.html`). Computer and phone, light and dark, all clickable and in sync.

### Header
- The "all done!" sticker (#10c95c, rotated −4°, 3px ink shadow), with the `cookMode.readyStart` / `readyAccent` headline under it, 14px apart.

### Layout
- **Computer:** a grid `1fr auto 1fr` with an 18px gap: Leftovers, a black "then" pill with a →, then Inventory. The pill reads "now" once Leftovers is done.
- **Phone:** one column, 12px gap, with a ↓ instead of the →.
- **Order:** Leftovers is the only live card at first. Inventory sits at 0.45 opacity, has no shadow and can't be tapped until Leftovers is added or skipped.

### Leftovers card
- **Header:** a blue "+" badge (40px, radius 12px), then "Add leftovers to Inventory".
- **How it works:** the same hint card as on Recipes (dashed border, yellow sticker, "Got it"), with three points:
  - Tap the squares to set how many portions are left.
  - Pick Fridge or Freezer. It sets how long the leftovers keep.
  - Add to Inventory saves them as a LEFTOVER item you can plan later. No leftovers skips this step.
- **Portions:** `cookMode.portionsLeft` with "n of 4", above four squares. Filled squares are #e6f5ec with an ink border and the number; empty ones are dashed. Tapping a square sets the count.
- **Fridge / Freezer:** a toggle on a white pill track; the picked side gets a 3px #2323ff shadow. On the phone, the label and day range stack in a 52px pill.
- **Preview:** the leftover item as it will appear in Inventory: photo (68px, or 48px on the phone), name, "n portions · Fridge" and the yellow LEFTOVER tag.
- **Buttons:**
  - "+ Add to Inventory" (blue) and "No leftovers" (white), split 2/3 and 1/3 on a computer.
  - On the phone they stack, 56px tall.
- **After a choice:**
  - A pale green ✓ badge, with "Leftovers added" or "No leftovers".
  - An Undo button: ink outline, 2px #2323ff shadow, 36px.

### Take out of your Inventory card
- **Header:** a pale green "−" badge, then "Take out of your Inventory".
- **How it works:** the same hint card, with three points:
  - Everything this recipe used is ticked. Untick anything you skipped or swapped.
  - Remove from inventory takes those amounts off your shelves, like the 900 g of chicken thighs.
  - Makeable and your grocery list then work from what you really have left.
- **Count:** the Makeable card footer. DM Mono 11px uppercase "5/6 INGREDIENTS · 1 STAYS", with a 4px #8f8fff bar on #e9e4d8 under it.
- **Shelves:** a DM Mono 600 13px name over a 2px ink line, with "n / total" on the right.
- **Rows:** in one white box with a 2px ink border and radius 18px. Each row has:
  - the emoji;
  - the name, in Bricolage 800 16px;
  - a grey line under the name: "300 g left after", or "6 in Inventory" when the item isn't used;
  - the amount, shown as a highlighter mark;
  - a 22px checkbox, #2323ff with a ✓.
- **Highlighter mark:** "− 900 g" in Bricolage 500 14px, slanted, on `linear-gradient(176deg, transparent 22%, rgba(255,225,77,.85) 26%, rgba(255,214,40,.9) 80%, transparent 84%)`.
- **Unticked rows:** 0.5 opacity, with the mark replaced by a grey "stays". Tapping a row toggles it.
- **Buttons:**
  - "Remove from inventory" (blue) and "Not now" (white), 2/3 and 1/3 on a computer.
  - On the phone they stack.
- **After a choice:** a one-line summary ("5 ingredients taken out of your Inventory", or "Inventory left as it was") with Undo.

### Pop-up and confetti
- **Pop-up:** after either Inventory button, over a 45% ink backdrop. A card, 420px at most, with:
  - the "all done!" sticker;
  - "Enjoy your supper";
  - one line on what changed;
  - a blue "Back to the app" button;
  - a "Stay on this page" link.
- **Confetti:** "Back to the app" closes the pop-up and fires about 110 pieces in #2323ff, #ffe14d, #10c95c, #ff5fa2 and ink. They burst out, then fall and fade over about 2 seconds.

### Dark mode (finished view)
Use the same tokens as the step view's dark mode:
- **Surfaces:** page #000000, cards #111115, inner boxes #1b1b21.
- **Text:** ink #f4f1ea, muted #9a9aa8.
- **Lines:** outlines #f4f1ea, thin lines #3a3a44, row dividers #26262e.
- **Shadows:** #2323ff.
- **Black pills** ("then" / "now") flip to #f4f1ea with ink text.
- **Accent fills** (#ffe14d, #10c95c, #e6f5ec) keep ink text: the "all done!" sticker, How it works, LEFTOVER, the portion squares, the "−" badge and the highlighter amounts.
- **Headline accent:** stays #2323ff.
- **Fridge / Freezer, picked side:** #2323ff with white text, a 2px white border and a 3px 3px 0 #000 shadow. The other side is #1b1b21 with ink text.
- **Ticked Inventory checkbox:** #ffe14d fill and border, ink ✓, with a 0 0 0 3px rgba(255,225,77,.25) glow.

### New copy
Add these to `en.js` and `fr.js`. French still needs writing:
- the two How it works lists;
- "Take out of your Inventory";
- "Remove from inventory";
- "Not now";
- "n/total ingredients" and "n stays";
- "left after" and "in Inventory";
- "stays";
- "Leftovers added" and "No leftovers";
- the summary lines;
- the pop-up copy.
