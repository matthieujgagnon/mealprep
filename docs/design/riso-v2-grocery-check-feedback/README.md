# Grocery: check feedback (motion): handoff

Adds motion and feedback to the three-step checkbox from `design_handoff_grocery` (row 6a), in Grocery (phone and desktop) and Store mode. Nothing about the layout, colours or the three states changes. This handoff only adds what happens between states.

Problem (Matt, Oct 13): "When you tap an item's box, it just disappears. You don't really see what you checked or where it went."

Files to touch:
- `client/src/components/GroceryItem.jsx`, `GroceryList.jsx` (Grocery rows, store footer, phone cart bar, desktop cart card)
- `client/src/components/StoreMode.jsx` and `GroceryItem.jsx` variant "store"
- `client/src/components/Toast.jsx` (one new option, see §6)
- `client/src/index.css` (`.riso-row*`, `.riso-grocery*`, `.store-mode*`)
- `client/src/i18n/en.js`, `fr.js` (§9)

## About the design files
`Grocery Check Feedback.dc.html` is a **design reference built in HTML**, not production code. Rebuild it with the app's React components, CSS and i18n. Open it in a browser with `support.js`, `kit.js` and `AppHeader.dc.html` next to it. Every board is live:
- Tap any box (Grocery) or row (Store mode).
- Scroll inside a phone to see the docked cart.
- Use **Slow motion ×4** and **Reduced motion** at the top. Each timing card has a **▶ Replay** button.

The timings in the cards and the motion on the boards come from one table (`T` in the file's logic), so they always match this README.

`Grocery.dc.html` is the approved 6a design, included for reference.

## Fidelity
**High fidelity** for motion: durations, delays, easing, scale values and colours are final. Items and stores are sample data.

---

## 0. Rules
1. **A checked row never leaves the list.** It stays where it is, tinted, until its store's "Add to inventory" takes it. This answers "it just disappears".
2. **One confirmation and one trip per tap.** The row confirms first (box, tint, strike-through). Then a small chip shows where the item is counted: the cart for ✓, the store footer for +.
3. **≤ 600 ms, never blocking.** Input is never disabled. A new tap on another row starts its own sequence while the previous chip is still in flight. A new tap on the **same** row cancels that row's running animations (`el.getAnimations().forEach(a => a.cancel())`) and starts the next step. A chip already in flight finishes on its own.
4. **One toast, never stacked.** Every tap updates the same toast with the item name and Undo.
5. **Reduced motion keeps the same information** with colour fades only (§7).

## 1. Easing tokens
| Token | Value | Used for |
| --- | --- | --- |
| `out` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | box, tint, strike, label, counts, footer, toast |
| `move` | `cubic-bezier(0.5, 0, 0.2, 1)` | the flying chip |
| `linear` | `linear` | flashes and text cross-fades |

"Pop" = scale keyframes `0.6 (opacity 0) → 1.12 at 60% → 1`, with `out`.

## 2. Tap once: to buy → ✓ bought (580 ms)
| Part | Start | Duration | What |
| --- | --- | --- | --- |
| Box | 0 | 160 | Background `#fffdf8 → #2323ff`. The ✓ pops. |
| Row | 40 | 160 | Row background `transparent → #f4f1ea`. Name `#16181f → #5e5b52`. |
| Strike | 40 | 200 | The strike-through draws left to right (see below). |
| Chip | 160 | 260 | The name chip lifts off and flies to the cart count (see below). |
| Count | 420 | 160 | The cart number goes +1 **when the chip lands**, and bumps `1 → 1.22 (40%) → 1`. The progress bar width animates over 240 ms with `out`. |

**Strike-through** is drawn with a background line, not `text-decoration`, so it can animate and still wrap across two lines:
- `background-image: linear-gradient(#5e5b52, #5e5b52)`
- `background-repeat: no-repeat`
- `background-position: 0 58%`
- `background-size: 0% 2px` for to buy, `100% 2px` for checked. Animate `background-size`.

The name must be an inline `<span>` (default `box-decoration-break: slice`), so the line sweeps one line after the other.

**Chip:**
- A pill with the item's name: 700 14px Bricolage, padding 5px 12px, radius 999px, 2px `#16181f` border, `#fffdf8` background, ink text, shadow `2px 2px 0 #16181f`. Max width 230px with an ellipsis.
- It sits in an overlay layer above the page (`position: absolute; pointer-events: none`), starting 14px left of the name's left edge and centred on the first line of the name.
- Keyframes, all one animation with easing `move`:
  - 0%: in place, opacity 0
  - 15%: `translateY(-6px) scale(1.04)`, opacity 1
  - 88%: at the target's centre, `scale(0.35)`, opacity 1
  - 100%: same place, opacity 0
- The chip is removed when the animation ends.
- **Target:** the count number in the phone cart bar, or in the docked copy (§5) when it's showing; on desktop, the 84px number on the cart card.

## 3. Tap twice: ✓ → + queued (540 ms)
| Part | Start | Duration | What |
| --- | --- | --- | --- |
| Box | 0 | 160 | ✓ becomes +. The + pops. |
| Row | 0 | 160 | Row background `#f4f1ea → #ebebff` |
| Footer | 0 | 200 | **First queued item in the store:** the footer opens. Its height goes from 0 to its natural height, padding-top/bottom from 0 to 14px, and opacity from 0 to 1. **Otherwise:** both numbers (in the "N en attente" line and in the button) roll up: `translateY(70%)`, opacity 0 → in place, 160 ms. |
| Label | 80 | 160 | "→ INVENTAIRE" fades in and slides `translateX(-8px) → 0`. |
| Chip | 120 | 260 | Same chip as §2, but blue (`#2323ff` background, white text) and reading "+ {name}". It flies to the "+ Ajouter N à l'inventaire" button. |
| Button | 380 | 160 | The Add button pulses `1 → 1.06 (40%) → 1`. |

- The cart count does **not** change: a queued item is still in the cart.
- If the footer is outside the visible scroll area, skip the chip and the pulse. The footer still opens or rolls.

## 4. Tap again: + → back to buy (600 ms)
| Part | Start | Duration | What |
| --- | --- | --- | --- |
| Box | 0 | 120 | Background `#2323ff → #fffdf8` (the + goes with it). |
| Row | 0 | 160 | Row background `#ebebff → transparent`. Name `#5e5b52 → #16181f`. |
| Strike | 0 | 200 | The line retracts (`background-size` `100% → 0%`). |
| Footer | 0 | 200 | The numbers roll down: `translateY(-70%) → 0`, 160 ms. If this was the store's last queued item, the footer closes: height, padding and top border go to 0 and opacity to 0. Keep it mounted until this ends. |
| Count | 0 | 160 | The cart number goes −1 right away and dips `1 → 0.88 (40%) → 1`. |
| Chip | 100 | 260 | The chip flies in reverse, from the cart count back to the row's name. Keyframes: 0% at the target, scale 0.35, opacity 0 · 12% opacity 1 · 85% in place, scale 1 · 100% opacity 0. |
| Flash | 300 | 300 | The row flashes `#fff1a8` and fades back to its own background (linear). Don't hold it during the delay (`fill: none`). |

Undoing a bought item (✓ → to buy, from the toast) plays this same sequence, without the footer part.
Undoing a queue (+ → ✓, from the toast) plays only the box pop and the row tint from §3, plus the footer roll-down or close from this section.

## 5. Phone: docked cart
The pink cart bar (6a §5) sits near the top of the page, so it scrolls away when you're deep in the list. While it is scrolled out of view, a compact copy docks at the bottom of the screen. The chip lands on whichever one is showing.
- **When:** the bar's bottom edge is above the top of the scroll area. Use an `IntersectionObserver` on the bar.
- **Dock:**
  - `position: fixed`, left/right 18px, bottom 16px plus the safe-area inset, 52px tall
  - padding 0 7px 0 16px, gap 12px
  - `#ff48b0`, 2px ink border, radius 26px, shadow `3px 3px 0 #16181f`
- **Contents:**
  - the count (800 26px Bricolage, -0.04em, tabular numbers)
  - a column with "Dans le panier" / "In your cart" (700 13px) above a 6px progress bar (`#f4f1ea` track, 1.5px ink border, `#16181f` fill)
  - the "Terminé" / "Done shopping" pill (36px, as on the bar)
- **Enter:** `translateY(12px)`, opacity 0 → in place, 180 ms with `out`. Reduced motion: opacity only. It leaves at once when the bar comes back into view.
- The page needs ~140px of bottom padding so the last rows can scroll above the dock.

**Desktop:** the cart card in the side column becomes `position: sticky; top: 24px`, so its count is always in view to receive the chip. The sale card stays under it, unchanged.

## 6. Undo: the shared toast
Every tap shows the shared toast (`Toast.jsx`, `.riso-toast`):

| Step | FR | EN |
| --- | --- | --- |
| → ✓ | « {name} · dans le panier » | "{name} · in your cart" |
| → + | « {name} · en attente pour l'inventaire » | "{name} · queued for inventory" |
| → to buy | « {name} · de retour dans la liste » | "{name} · back on the list" |

The button is `common.undo` (« Annuler » / "Undo").

- **Layout:**
  - the name (700 14px, with an ellipsis when long)
  - then "· {verb}" (500 14px, `#d6cfbf`), which never wraps
  - then the yellow Undo pill (28px) inside a 44px-tall hit area
  - toast padding is 2px 6px 2px 20px; everything else is as the shared toast
- **One toast:** a new tap replaces the text of the toast that is already showing. It never stacks and never re-enters.
  - First show: `translate(-50%, 8px)`, opacity 0 → in place, 160 ms with `out`.
  - Later taps: the text cross-fades from opacity 0 to 1, 120 ms linear.
- **Timer:** 5 s after the **last** tap (each tap restarts it). It leaves with an opacity fade, 160 ms.
- **Undo:** puts that item back in the state it had before the tap and plays the matching sequence (§4). The toast closes.
- **Position:** 96px from the bottom on phone (it clears the dock), 28px on desktop.
- **New `Toast.jsx` option:** `replace: true`, so the same toast instance updates its text and restarts its timer instead of queuing.

## 7. Reduced motion (`prefers-reduced-motion: reduce`)
No chip, no scaling, no sliding. Every state change happens at once, and the same information comes through colour:
- **Row:** flashes `#fff1a8` and fades to its new background over 600 ms (linear). In Store mode it flashes `#3d3714` and fades to the card colour `#111115`.
- **Where it went:**
  - when the cart count changes, the cart holder (phone bar, dock or desktop card) flashes `#ffe14d` and fades back to `#ff48b0` over 600 ms
  - for → + and + → ✓, the store footer flashes `#ffe14d` and fades back to `#ebebff`
  - in Store mode, the count row flashes `rgba(255,225,77,0.28)` to transparent
- **Toast:** as in §6, with the item's name, but it enters with opacity only (120 ms, no rise).
- **No lag:** the counts update at the moment of the tap. Progress bars don't transition.

## 8. Store mode (dark, 72px rows)
Store mode keeps its single step (bought or not). Queueing for inventory still happens through "← List", as today.
- **Target:** the whole 72px row. Not only the box.

**Check (580 ms):**
| Part | Start | Duration | What |
| --- | --- | --- | --- |
| Box | 0 | 160 | The 34px box goes from transparent to `#2323ff`. The ✓ pops. |
| Strike | 40 | 200 | The line draws as in §2, colour `#f4f1ea`. |
| Chip | 160 | 260 | The chip flies to the big "N restants" count. |
| Row | 240 | 200 | The row fades from opacity 1 to 0.45. |
| Count | 420 | 160 | The count goes −1 when the chip lands and bumps `1 → 1.22 → 1`. The store's "N RESTANTS" badge updates at the same moment, and the pink progress bar width animates over 240 ms. |

The chip is `#f4f1ea` with ink text, a 2px ink border and a `2px 2px 0 #2323ff` shadow.

- **Uncheck:** uses the §4 timings:
  - the row goes from opacity 0.45 to 1
  - the strike-through retracts
  - the count goes +1 right away and bumps
  - the chip flies from the count back to the row
  - the row flashes `#3d3714 → #111115`
- **Toast (light version for the dark screen):**
  - `#f4f1ea` background, ink text, shadow `4px 4px 0 #2323ff`, 700 16px
  - 24px from the bottom
  - "· {verb}" is in `#3f3e37`
  - Undo is a 40px pill with a 2px ink border (800 15px) inside a 48px hit area

## 9. New i18n strings
Add to `en.js` / `fr.js` (for example under `grocery.*`):
- `toastInCart`: "{name} · in your cart" / « {name} · dans le panier »
- `toastQueued`: "{name} · queued for inventory" / « {name} · en attente pour l'inventaire »
- `toastBack`: "{name} · back on the list" / « {name} · de retour dans la liste »

The dock reuses `grocery.inCart` and the "Done shopping" / « Terminé » short form from the 6a handoff. The toast button reuses `common.undo`.

## 10. State and implementation notes
- **Cart count lag:** the visible cart count leaves out items whose chip is still in flight. Keep a per-list `Set` of in-flight ids: add the id on tap (to buy → ✓), remove it when the chip's animation ends. Reduced motion skips the set.
- **Footer close:** keep the footer mounted (showing its last labels) until its close animation ends, then unmount it.
- **Toast state:** the toast holds `{ id, from, to }` so Undo knows what to restore. It is not saved.
- **Animation method:** use the Web Animations API (`el.animate`) started after the state commit, in `useLayoutEffect`, so there's no flash of the end state. The resting styles stay in CSS/inline styles, and the animations only play from the old values to the new ones.
- **Chip layer:** one absolutely positioned layer per screen with `pointer-events: none`. Rects come from `getBoundingClientRect()`, relative to that layer.

## 11. Developer-only slow motion
To check the motion in the live app, add a hidden setting that multiplies every duration and delay in §2–§8 by a factor. Users never see it.
- **Turn on:** open the app with `?slowmo=4` (any number, e.g. `2`, `4`, `10`). Save the value in `sessionStorage` (`mm.slowmo`), so it survives page changes in that tab. `?slowmo=1` or closing the tab turns it off.
- **Applies to:** every motion in this handoff:
  - chip, box, tint, strike-through, label, footer, counts
  - the dock's entrance
  - the toast's entrance, text cross-fade and exit
  - the progress-bar width transitions
- **Does not apply to:** the toast's 5 s timer, which stays real time.
- **Where:** one helper, e.g. `client/src/lib/motion.js`, exporting `ms(n) => n * slowmo`. Every duration and delay in the Grocery and Store mode animations goes through it.
- **Production:** read the flag only when `import.meta.env.DEV` is true, or when a `debug` flag is already set. No UI, no i18n.
- The reference file has the same thing as the "Slow motion ×4" switch at the top.

## 12. Tokens used
- Ink `#16181f`
- Paper `#f4f1ea`
- Card `#fffdf8`
- Blue `#2323ff`
- Queued tint `#ebebff`
- Pink `#ff48b0`
- Yellow `#ffe14d`
- Flash `#fff1a8` (new)
- Store-mode flash `#3d3714` (new)
- Muted `#5e5b52`
- Faint `#a9a598`
- Rule `#d6cfbf`
- Store mode: background `#000000`, card `#111115`, card border `#26262e`, line `#2a2a34`

## Files
- `Grocery Check Feedback.dc.html`: the motion study (phone FR/EN, Store mode FR/EN, desktop FR/EN, timing cards)
- `Grocery.dc.html`: the approved 6a page this builds on
- `AppHeader.dc.html`, `kit.js`, `support.js`: needed to open the designs
