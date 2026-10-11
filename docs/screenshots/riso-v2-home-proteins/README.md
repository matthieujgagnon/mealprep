# Home: the Proteins on sale card

Screenshots of the card against `docs/design/riso-v2-home-proteins/`.

- `desktop-en-*`: 1280 px wide, English. 1 is the card closed: a row for each protein that has something on sale, in the design's order, with one « Best deal » (the row whose best buy saves the most; here Beef, 50%) and « Can't tell yet » on Tofu, which has a price but nothing to compare it with. 2 is Chicken open: the products as cards, three across, the best buy first with the green shadow, the other rows blurred and dimmed. 3 is a product tapped: its strip with the regular price, when the sale ends and Quebec's average (each shown only when the flyers give it), Add to list and See in Flyers.
- `wide-en-4-right-row-strip.png`: 1600 px wide. From 1560 px the rows come in two columns, and a row in the right column opens across both, so the pop-out lines up with it.
- `phone-fr-*`: 390 px wide, French. 1 is the card closed (« Fruits de mer » wraps to two lines rather than meet the verdict); 2 is Chicken open, two cards across; 3 is a product tapped: the strip scrolls into view inside the pop-out, with « + Ajouter à la liste » and « Voir dans Circulaires → ».

The data is a test account's flyers, made up for the screenshots: no real store, price or date. The flyer photos are plain gradients standing in for real ones (a product with no photo gets the striped paper with its kind's emoji); the end dates and the Quebec averages are added to the test account's answer, since Statistics Canada is not reachable from the test server. Re-take them with a local server and any test account that has a few flyer deals under each protein.
