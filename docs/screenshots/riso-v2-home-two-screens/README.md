# Home: two screens with dots

Screenshots against `docs/design/riso-v2-home-two-screens/` (the README there first).

- `desktop-en-*`: 1280 × 900, English. 1 is screen 1: the greeting, the meal on now beside the Grocery card, and the week strip, down to the bottom of the window. 2 is screen 2: Proteins on sale, Makeable now and Use it up. The dots are on the right edge, the lit one tall and filled. At this height both screens fit, so the scroller snaps from one to the other.
- `phone-fr-*`: 390 × 844, French. 1 and 2 are the top of each screen. On a phone both screens are taller than the window (about 2 times), so the scroller moves freely instead of snapping; the dots still follow the scroll and jump when tapped. The cards keep the design's 18 px on each side, and the dots sit inside that gutter, so none is ever under a dot (the ring around a dot keeps it apart from the hero's hard shadow where they cross).

The data is a test account made up for the screenshots: a planned week, some flyer deals, and a few items about to expire. The hero's photo is the striped paper a recipe without a photo gets. Re-take them with a local server and any test account that has a planned week, flyer deals and expiring items.
