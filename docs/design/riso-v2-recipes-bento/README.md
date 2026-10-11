# Handoff: Recipes page, bento grid

## Overview
A redesign of the Recipes page (`client/src/components/RecipesDesktop.jsx` / `Recipes.jsx` in `matthieujgagnon/mealprep`). The uniform card grid becomes a bento grid of full-bleed photo tiles at mixed sizes. Each tile shows the meal type, protein and time at the top and the title at the bottom over a dark gradient. The title, search bar, filter pills and recipe count above the grid keep the existing Riso V2 look.

## About the design files
The files in this bundle are **design references built in HTML**. They show the intended look and behaviour; they are not production code to copy. Recreate the design in the existing React app using its patterns (`index.css` `.rv2` / `.riso-recipes` classes, `RisoControls.jsx` for search and pills, the i18n files for copy). Open `page-recipes-test-bento.dc.html` in a browser to see it (it needs `support.js`, `part-header.dc.html` and `part-copy.js` next to it).

## Fidelity
**High fidelity.** Colors, type, spacing, radii, shadows and grid spans are final. The header, search bar and pills are already in the app; the grid tiles are the new part.

## Screen: Recipes (desktop + narrow fallback)

### Page shell
- Background `#F4F1EA`, text `#16181F`, font Bricolage Grotesque.
- Content container: `max-width: 1280px`, centered.
- Header: the existing app header (`part-header`, `active="recipes"`), unchanged.
- Body: `padding: 8px 40px 64px`, flex column, `gap: 22px`.

### Above the grid (existing components, for reference)
1. **Title** — "Recipes" / "Recettes". Bricolage 800, 60px, line-height .95, letter-spacing -.035em.
2. **Search bar** — height 52px, radius 30px, `2px solid #16181F`, bg `#FFFDF8`, shadow `5px 5px 0 #16181F`, padding `0 8px 0 20px`. Placeholder "Title, ingredient or tag" / "Titre, ingrédient ou étiquette", 500 16px, `#8A8677`.
3. **Filter pills** — flex wrap, gap 8px. Each pill: height 36px, padding `0 16px`, radius 22px, `2px solid #16181F`, 700 13.5px Bricolage.
   - Active ("All"): bg `#16181F`, text `#F4F1EA`, shadow `2px 2px 0 #2323FF`.
   - Inactive ("Quick", "Meal ▾", "Protein ▾"): bg `#FFFDF8`, text `#16181F`, no shadow.
4. **Count** — "8 RECIPES" / "8 RECETTES", DM Mono 500 11px, letter-spacing .12em.

### Bento grid (new)
- Container: `display: grid`, `gap: 28px`, `padding: 10px 6px 0`.
- **Wide (container/viewport ≥ 1100px):** `grid-template-columns: repeat(4, minmax(0,1fr))`, `grid-auto-rows: 300px`.
- **Narrow (< 1100px):** `repeat(auto-fill, minmax(min(100%,240px), 1fr))`, `grid-auto-rows: 340px`, every tile `span 1 / span 1`, title 20px.

Span pattern for the first 8 tiles (wide). Repeat it every 8 recipes. The pattern fills a 4-column grid with no gaps (5 rows):

| # | Columns | Rows | Title size |
|---|---|---|---|
| 1 | span 2 | span 2 | 34px |
| 2 | span 1 | span 1 | 18px |
| 3 | span 1 | span 1 | 18px |
| 4 | span 2 | span 1 | 26px |
| 5 | span 1 | span 2 | 26px |
| 6 | span 2 | span 1 | 26px |
| 7 | span 1 | span 1 | 18px |
| 8 | span 3 | span 1 | 30px |

Title size follows tile size: 1×1 = 18px, 2×1 or 1×2 = 26px, 3×1 = 30px, 2×2 = 34px.

### Tile
- `position: relative`, `min-width: 0`, `overflow: hidden`, `cursor: pointer`.
- Radius 20px, border `2px solid #16181F`.
- Shadow: `0 10px 24px -6px rgba(22,24,31,.35), 0 2px 6px rgba(22,24,31,.15)` (soft drop, not the hard offset used elsewhere).
- Background: recipe photo, `center / cover no-repeat`, fallback color `#E9E4D8`.
- **Top scrim:** absolute inset 0, `linear-gradient(to bottom, rgba(22,24,31,.45), rgba(22,24,31,0) 22%)`.
- **Top row:** absolute `top 14px; left 16px; right 16px`, flex space-between, align start. Text `#FFFDF8`, DM Mono 500 10.5px, letter-spacing .1em, uppercase.
  - Left: column, gap 3px. Line 1 meal type (weight 600), e.g. "DINNER". Line 2 protein at opacity .65, e.g. "CHICKEN". Leave out line 2 when the recipe has no protein tag.
  - Right: total time, e.g. "35 MIN", "4 H".
- **Bottom title band:** absolute `left 0; right 0; bottom 0`, height 46%, flex align-end, padding `0 18px 18px`. Background `linear-gradient(to top, rgba(14,16,22,.9) 0%, rgba(14,16,22,.64) 38%, rgba(14,16,22,0) 100%)`.
  - Title: Bricolage 700, size from the table, line-height 1.12, `#FFFDF8`, centered, `text-wrap: balance`, `text-shadow: 0 1px 8px rgba(0,0,0,.45)`, clamped to 3 lines.
- **Meal stripe:** absolute `left 25%; right 25%; bottom 0`, height 2px, radius `2px 2px 0 0`, opacity .55. Color by meal type:
  - Dinner / supper `#2323FF`
  - Lunch `#FF48B0`
  - Breakfast `#FFE14D`

## Interactions & behavior
- Clicking a tile opens the existing recipe card pop-up (same handler as the current grid card).
- The layout switch happens at 1100px wide (the prototype checks `window.innerWidth`; in the app it's better to use a container query or ResizeObserver on the grid).
- Search and pills keep their current behavior. Filtering re-flows the visible results through the same span pattern by index, so the first result is always the 2×2 tile.
- No hover state in the prototype. If you add one, keep it subtle (for example a slightly stronger shadow); don't move or scale the tile.

## State
- Nothing new. The grid needs, per recipe: title (fr/en), photo URL, meal type, primary protein (optional), total time.
- Tile index → span/title size comes from the table above (`index % 8`).

## i18n
The prototype has a `lang` prop (`fr` default, `en`). Strings:
- Title: Recettes / Recipes
- Search: Titre, ingrédient ou étiquette / Title, ingredient or tag
- Pills: Tout / All, Rapide / Quick, Repas ▾ / Meal ▾, Protéine ▾ / Protein ▾
- Count: N RECETTES / N RECIPES
- Meal: Souper / Dinner, Dîner / Lunch, Déjeuner / Breakfast
- Protein: Poulet / Chicken, Bœuf / Beef

Use the app's existing i18n keys where they exist. The app uses "supper" wording in English elsewhere; check which one the app currently uses before shipping "Dinner".

## Design tokens
- Ink `#16181F`
- Paper `#F4F1EA`
- Card / field `#FFFDF8`
- Muted text `#8A8677`
- Photo fallback `#E9E4D8`
- Blue `#2323FF`, Pink `#FF48B0`, Yellow `#FFE14D`
- Fonts: Bricolage Grotesque (500–800), DM Mono (500, 600)
- Radii: tile 20px, pill 22px, search 30px
- Shadows: hard `5px 5px 0 #16181F` (search), `2px 2px 0 #2323FF` (active pill), soft tile shadow above
- Grid gap 28px; page side padding 40px

## Assets
Recipe photos in the prototype are Unsplash placeholders. Use the recipe's real image from the app's data.

## Files
- `page-recipes-test-bento.dc.html` — the design (template + logic with data, span table and breakpoint)
- `part-header.dc.html` — existing app header, for context
- `part-copy.js` — copy strings used by the header
- `support.js` — runtime needed to open the HTML files locally
