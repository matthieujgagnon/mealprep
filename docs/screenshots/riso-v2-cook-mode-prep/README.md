# Cook mode, "Before you start" (the prep page, state 5.0)

Screenshots of the prep page against `docs/design/riso-v2-cook-mode-prep/`. The recipe is a sheet-pan chicken shawarma written in English (and its French twin) with prep notes on some ingredients, so each group has a row.

- `desktop-en-*`: 1280 × 800, English. 1 is light, 2 is dark, 3 has two rows ticked (chicken and garlic), 4 is step 2 of the same recipe: the chicken and the garlic are already ticked in "For this step", the red onions are not. The list is longer than the screen, so the middle column scrolls (the last row is cut at its edge); the rail, photo, Do first card and both bars stay.
- `phone-fr-*`: 390 × 844, French. 1 is light, 2 is dark, 3 is dark scrolled to the end (the top bar, the dots and the Start button stay), 4 is step 2 with the carried-over tick.
- `tablet-900-en-light-prep.png`: between a phone and a wide screen the photo and Do first drop under the list, as they do under a step.

What the design's mock shows that real data can't: its Measure rows (olive oil, shawarma spice, yogurt) have no prep note, and lines like "Set beside the pan" or "Keep 1 for the sauce" are not in any recipe, so the page lists only ingredients that have a note and writes the how line from that note. The step tags are the app's own matching, so an ingredient also named in a later step (the chicken in "Assemble") shows that step too.

The recipe photo is a plain placeholder standing in for a real one. The fonts are the browser's fallback sans because the build machine can't load Google Fonts; the app loads Bricolage Grotesque and DM Mono.
