# Grocery list: clear feedback when you check an item

Screenshots against `docs/design/riso-v2-grocery-check-feedback/` (the README there first). The phone is 390 × 844, French; the computer is 1280 wide, English. A checked row never leaves its place, and every tap shows which item changed and where it went. Frames in the middle of a movement have every animation paused at a chosen time after the tap (so the picture is the same every time).

On the phone, in order:
- `phone-fr-01-before`: the pink cart bar (« 0 DANS LE PANIER », « Terminé », the progress bar) now has « Je suis à l'épicerie » inside it; Aluminum foil is the first row of Super C.
- `phone-fr-02-checked-chip-flying`: one tap, 275 ms in. The row is tinted and struck through where it is, the name chip is on its way to the cart (the number still says 0: it counts when the chip lands), and the one toast says « Aluminum foil · dans le panier » with « Annuler ».
- `phone-fr-03-checked-in-cart`: landed. The row stays where it is, the cart says 1.
- `phone-fr-04-queued-chip-to-footer`: the second tap, 240 ms in. The row turns light blue (« → INVENTAIRE »), Super C's footer has opened and a blue « + Aluminum foil » chip flies to its button. The cart still says 1. The French toast says « Aluminum foil · → inventaire » (the same words as the row's « → INVENTAIRE »), so the name stays whole.
- `phone-fr-05-queued-footer-open`: settled. « 1 EN ATTENTE · ALUMINUM FOIL » and « + Ajouter 1 à l'inventaire ».
- `phone-fr-06-back-chip-returning`: the third tap, 215 ms in. The count is already back to 0, the chip comes out of the cart back to the row, the row is flashing, and the footer is closing.
- `phone-fr-07-back-on-the-list`: « Aluminum foil · dans la liste ». Undo would put the + step back.
- `phone-fr-08-dock`: scrolled past the bar, its docked copy is at the bottom: the count, « Dans le panier » over the progress bar, the shop-icon button for Store mode and « Terminé » (greyed while the cart is empty). It is the one thing at the bottom of the screen.
- `phone-fr-09-dock-chip-flying` and `phone-fr-10-dock-toast-above`: a tap deep in the list, the chip flying to the dock's number, and the toast sitting above the dock without touching it.
- `phone-fr-11-page-end`: the end of the page. The sale card scrolls fully clear above the dock.
- `phone-fr-12-store-mode` to `phone-fr-15-store-mode-toast-light`: Store mode, opened from the dock's shop button. The chip flies to the big count, which drops when it lands; the toast is paper-coloured on the dark screen (`14`) and the usual ink pill on the light one (`15`), both with « Annuler ».
- `phone-fr-17-toasts-360-long-name`: a 360 px phone and a long name, « Papier d'aluminium », through the three steps and in Store mode (bigger text). The name is never cut: when it and the verb don't both fit on a line, the verb goes under the name, and the pill is no taller.
- `phone-fr-16-reduced-motion-flash`: the same tap with the device asking for less motion, 90 ms in. Nothing moves and there is no chip: the row and the cart flash a colour that fades, and the count is already 1.

On a computer: `desktop-en-01-checked-chip-flying` (the chip on its way to the cart card in the sticky side column) and `desktop-en-02-checked-in-cart`.

The data is a test account made up for the screenshots: five planned recipes, three flyer deals, two items typed in and a store you made (the seed of `e2e/grocery-three-steps.spec.js`, with a few more ingredients so the phone has a list to scroll). The behaviour in them is tested by `e2e/grocery-check-feedback.spec.js`.
