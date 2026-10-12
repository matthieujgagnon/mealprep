# Home: two screens with vertical snap (handoff)

Home in `client/src/components/Home.jsx` becomes two full-height screens that snap vertically, with a dot indicator on the right edge. **Only the layout changes.** The cards, their copy, states and styles (`.riso-home-*`, `.riso-protein-*`, `.riso-useup-*`) stay as they are now.

## About the design files
`Home.dc.html` is a **design reference built in HTML**, not production code. It shows how the screens should look and behave. Rebuild it with the app's existing React components, CSS and i18n. To view it, open the file in a browser. It needs `support.js`, `kit.js` and `AppHeader.dc.html` in the same folder. It shows state **2.0** at desktop 1280 and phone 390, in English and French. Scroll inside a board, or tap a dot, to try it.

## Fidelity
**High fidelity.** The measurements below are final. The data shown in the cards is the existing sample data.

---

## 1. What goes on each screen
- **Screen 1:** the greeting, then the hero (the meal on now) next to the Grocery list card, then the week strip (Suppers / All meals).
- **Screen 2:** Proteins on sale, Makeable now (shown only when it has something) and Use it up.

The grid inside each screen does not change:
- Top row on desktop: `minmax(0,1.7fr) minmax(0,1fr)`.
- Bottom row on desktop: three columns `1.15fr 1fr 1fr`, or two columns `1.7fr 1fr` when Makeable is hidden.
- On phone, both rows are a single column.

## 2. Structure
```
.home-page (fills the viewport under the app header)
└─ .home-scroller   ← the scrolling container
   └─ padding wrapper (0 40px desktop / 0 18px phone)
      ├─ section.home-screen[data-screen="1"]
      └─ section.home-screen[data-screen="2"]
└─ nav.home-dots    ← absolutely positioned over the scroller
```

### Scroller
- It fills the height left under the app header: `flex: 1; min-height: 0`. In the app, that is `height: calc(100dvh - <header height>)`.
- `overflow-y: auto`
- `scroll-snap-type: y mandatory`
- `container-type: size`, so each screen can use `100cqh`
- `scroll-behavior: smooth`
- Hide the scrollbar: `scrollbar-width: none` and `::-webkit-scrollbar { display: none }`
- The page itself (`body`) must not scroll on Home.

### Screens
Both screens:
- `min-height: 100cqh` (the scroller's height)
- `scroll-snap-align: start`
- `box-sizing: border-box`
- Flex column

If a screen is taller than the viewport, it scrolls normally inside itself. This is common on phone. Snapping only happens at the boundary between the two screens.

Spacing per screen:

| | Desktop | Phone |
| --- | --- | --- |
| Screen 1 padding | 24px top, 32px bottom | 18px top, 32px bottom |
| Screen 1 gap between blocks | 24px | 24px |
| Screen 2 padding | 24px top, 44px bottom | 18px top, 40px bottom |
| Screen 2 grid gap | 20px | 20px |

## 3. Dot indicator
The dots sit as one vertical column over the scroller:
- Position: `position: absolute`, `right: 10px` on desktop and `2px` on phone.
- Vertical placement: `top: calc(50% + 40px)` with `translateY(-50%)`. This centres the dots on the area under the header, not on the whole page.
- Layout: flex column, gap 4px, `z-index: 40`.

There is one button per screen.
- **Hit area:** 24px wide. It is 34px tall for the active screen and 20px tall otherwise. The pill is centred inside it.
- **Pill:**
  - 10px wide, radius 5px, 2px `#16181f` border.
  - **Active:** 26px tall, filled `#16181f`.
  - **Inactive:** 10px tall, filled `#f4f1ea`.
  - Transition: `height .2s, background .2s`.
- **Accessibility:** add `aria-label` "Screen 1" / "Screen 2" (fr "Écran 1" / "Écran 2") and `aria-current="true"` on the active dot. These are new i18n strings: `home.screenN`.

## 4. Behaviour
- **Active screen:** screen 2 is active when `scrollTop + clientHeight / 2 >= screen2.offsetTop`. Give the scroller `position: relative` so `offsetTop` is measured from the scroller, not from the page. Otherwise screen 1 is active. Recalculate it on `scroll`; throttling it with rAF is fine.
- **Tapping a dot:** scrolls the scroller to the top of that screen (`scrollTop = 0`, or `screen2.offsetTop`). The scroll is smooth.
- **Proteins on sale:** when the panel is open, the scrim and blur cover the whole board, as they do now. While it is open, the dots stay visible but sit under the scrim (scrim `z-index: 60`).
- **Week strip on phone:** it still scrolls sideways and centres on today when it loads. Horizontal swipes on it must not trigger vertical snap.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, set `scroll-behavior: auto` and remove the dot transition.
- **Returning to Home:** Home always opens on screen 1.

## 5. State
- `activeScreen`: 0 or 1, from the scroll handler.
- A `ref` on the scroller, and a `ref` on screen 2 for its `offsetTop`.
- Nothing is persisted.

## 6. Tokens used
- Ink `#16181f`
- Paper `#f4f1ea`
- Card `#fffdf8`
- Blue `#2323ff`
- Pink `#ff48b0`
- Yellow `#ffe14d`
- Green `#10c95c`

These tokens and the type styles (Bricolage Grotesque, DM Mono, Inter) are unchanged from the current Home.

## Files
- `Home.dc.html`: the design, set to show only state 2.0. The `only` prop accepts other state ids, such as `2.1,2.6`.
- `AppHeader.dc.html`: the header used in the boards.
- `kit.js`: the i18n strings (from `en.js` / `fr.js`) and the board sizes.
- `support.js`: the runtime needed to open the design files.
