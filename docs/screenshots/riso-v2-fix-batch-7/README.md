# Fix batch 7: Planner calendar pop-up, search line, every page opens at its top

Screenshots with local test data (eight recipes with plain coloured pictures, nine planned meals and
a week of Metro flyer deals were put in a throwaway database for the pictures; none of it is in the app).

- `en-1280-calendar-day-card.png`: desktop (1280 px), English. The week calendar is fully inside the window (it used to start 40 px off the left edge, because it was centred on the date pill, which sits near the left), and hovering Tuesday shows its three meals in a card beside it. There was no room on the calendar's left, so the card is on its right; it is inside the window on all four sides.
- `en-768-calendar-day-card.png`: the narrowest computer width (768 px), the same: calendar and card inside the window, side by side.
- `en-1280-search-panel-no-bar.png`: desktop, the recipe search panel under the board. The short grey bar that sat above the hint line is gone; the panel starts with its hint, then the search.
- `fr-390-recipes-scrolled-down.png`, `fr-390-flyers-opens-at-top.png`: phone (390 px), Quebec French. Recipes scrolled to the very bottom, then « Circulaires » (Flyers) from the header: it opens at the top of the page. (Before, it opened where Recipes had been, and then scrolled itself down to its « Aller à » bar.)
- `fr-390-planner-search-dashed-line.png`: phone, the Planner. The dashed line between the board and the search pill stays on a phone (only the computer's grey bar went).
- `fr-390-calendar-day-card.png`: phone, the week calendar: tapping a day shows its meals under its row, as before.
