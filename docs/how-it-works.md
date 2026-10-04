# How the app works (for contributors)

This is a map of the project for someone opening it for the first time. For what each screen does for a user, open **Help** in the app. For how flyer deals are read and judged, see [How the Flyers work](flyers-how-it-works.md).

## Stack

- **Frontend:** React 18 with Vite, plain CSS (`client/src/index.css`), and `@dnd-kit` for drag and drop.
- **Backend:** Node with Express.
- **Database:** Postgres through Prisma. Migrations live in `server/prisma/migrations/`.
- **Language:** every text is in both Quebec French and English (see "Languages" below).
- **Hosting:** the server also serves the built client. The README describes the Render and Neon setup.

## Folder layout

| Path | What is in it |
| --- | --- |
| `client/src/App.jsx` | The shell: header, tabs, shared data, and which screen shows. |
| `client/src/components/` | One file per screen or big piece (`Home`, `Recipes`, `RecipeDetailModal`, `CookMode`, `PlannerBoard`, `WhatCanIMake`, `GroceryList`, `StoreMode`, `FlyerDeals`, `Inventory`, `Help`). `RisoControls.jsx` holds the shared Riso Poster controls. |
| `client/src/lib/` | Plain logic with unit tests: grocery list building, units, dates, flyer ingredient cards. |
| `client/src/i18n/` | `en.js`, `fr.js`, the `t()` helper and the guards that check both languages. |
| `client/src/index.css` | All styles. The Riso Poster colours, fonts and shadows are tokens on `.riso-theme`. |
| `server/src/index.js` | Starts Express, mounts the routes and runs the hourly checks. |
| `server/src/routes/` | One router per area (`recipes`, `planner`, `pantryInventory`, `flyers`, `deals`, `receipts`, `auth`, `cron`...). |
| `server/src/lib/` | Server logic with unit tests: the Flipp reader, price comparison, Statistics Canada averages, FoodKeeper matching, recipe import. |
| `server/data/foodkeeper.json` | The bundled USDA FoodKeeper storage times. |
| `server/prisma/schema.prisma` | The database tables. |
| `e2e/` | Playwright browser tests. |
| `docs/` | These documents. |

## Where the data comes from

| Source | Used for | Where |
| --- | --- | --- |
| Flipp | Weekly flyer deals, prices and photos. | `server/src/lib/flipp.js`, `flyerImport.js` |
| Statistics Canada | Quebec average prices (table 18-10-0245-01), through its public Web Data Service. The app converts units and compares prices, so it credits the data as adapted, under the Statistics Canada Open Licence ([English](https://www.statcan.gc.ca/en/terms-conditions/open-licence), [French](https://www.statcan.gc.ca/fr/avis/licence-ouverte)). The Help page's credit and both Statistics Canada links follow the app's language: the French credit names the table « Prix de détail moyens mensuels pour certains produits » and links to the French table and licence pages. | `server/src/lib/statcan.js`, `baselines.js` |
| USDA FoodKeeper | Storage times behind use-by dates. | `server/data/foodkeeper.json`, `server/src/lib/foodkeeper.js` |
| TheMealDB | Generic ingredient pictures for Inventory items with no photo. | `client/src/lib/ingredientPhoto.js` |
| Google Gemini | Reads uploaded flyer and receipt files. | `server/src/routes/flyers.js`, `receipts.js` |
| Le Rabais | An older flyer source. Nothing is imported from it now; old rows are retired. | `server/src/lib/flyerImport.js` |

The in-app **Sources and credits** section lists the same sources. If you add or drop one, update `help.sources` in both language files and `SOURCES` in `client/src/components/Help.jsx`.

## Run it locally

1. Make a Postgres database. [Neon](https://neon.tech) has a free one, or run Postgres yourself.
2. Create `server/.env` with these names. Use your own values and never commit this file:
   - `DATABASE_URL`: your Postgres connection string.
   - `PORT`: for example `4000`.
   - `APP_URL`: for example `http://localhost:5173`.
   - `GEMINI_API_KEY`: optional. Only flyer upload and receipt scanning need it.
   - `RESEND_API_KEY`: optional. Only "forgot password" emails need it.
   - `CRON_SECRET`: optional. Only the weekly wake-up call needs it.
3. Install and set up the database:
   ```bash
   npm install
   npm run setup
   ```
4. Start the server and the client in two terminals:
   ```bash
   npm run dev:server   # http://localhost:4000
   npm run dev:client   # http://localhost:5173
   ```

## Quality gates

Continuous integration (`.github/workflows/ci.yml`) runs on every push and pull request, against a throwaway Postgres:

1. `npm run build` applies every migration to a fresh database and builds the client.
2. `npm test` runs the unit tests (Vitest). This includes the language guards.
3. `npm run test:e2e` runs the browser tests (Playwright) against the built app.

While working, run only what your change touches. For example, `npx vitest run client/src/i18n` for text changes, or `npx playwright test e2e/help.spec.js` for one browser test (build first with `npm run build`). Let CI run the whole suite.

## Languages

- Every text is `t("screen.key")`. The words live in `client/src/i18n/en.js` and `fr.js`, with the same keys. Write Quebec French first.
- A name that reads the same in both languages goes under `same.*`.
- Lists of sentences (like the Help sections) are read with `dict()`.
- `client/src/i18n/i18n.test.js` fails when:
  - the two files have different keys or placeholders;
  - a French text is just English left in place;
  - a key used in code doesn't exist;
  - English is typed straight into a screen.

## Design

Screens use the Riso Poster look: paper background, ink outlines, hard shadows, and blue, pink, yellow and green accents. Colours come from the `--riso-*` tokens in `index.css`. Reuse the existing classes (`riso-chip`, `riso-btn`, `riso-eyebrow`...) before adding new ones, and add no new colours.

The grocery item is one component, `components/GroceryItem.jsx`, used by By store, By aisle, By recipe (`variant="line"`) and Store mode (`variant="store"`). Do not draw an item anywhere else. Its design is in `docs/design/grocery-item/README.md` (the handoff, with the `.dc.html` references). How many to buy is a plain number (`lib/groceryQuantity.js`); the unit only shows in the read-only recipe quantity. In a list the right side is fixed columns (sale tag or + Inventory, recipe quantity, a round number, ×) so they line up from row to row; on a phone the sale tag is not shown when the phone is held upright (no room beside the name) and, sideways, sits just left of the number like on a computer. Store mode rows show only the name and the number to buy (no meta line, no sale tag). Every item in a view is one height: CSS sets `max(--gi-min, --gi-h)`, and `hooks/useEqualRowHeight.js` sets `--gi-h` from the view's longest name, so no name is cut.

The Inventory item form is one component, `components/InventoryItemForm.jsx`, for both "+ Add item" and a tapped item card (`mode="add" | "edit"`). Its design is in `docs/design/inventory-item-form/README.md`; its logic (dates and days, the expiry tag and line, fallback shelf life, amount steps, what gets saved) is in `lib/inventoryForm.js`. Add goes straight to Inventory, because typing an item in Inventory's own form counts as confirming it; every other way of adding still uses the confirmation sheet. Edit works on a copy and saves only with Save changes. The server gives the form USDA shelf life for every shelf (`/pantry-inventory/suggest`) and the Recent chips (`/pantry-inventory/recent`).

Buttons press in for a moment (under 150 ms) through one shared rule in `index.css`, next to `.riso-btn`: `riso-btn`, `riso-chip`, `riso-filter-chip`, the Grocery and Store mode buttons, and anything with `riso-press`. A new kind of button joins by using one of those classes or by being added to that list. The global reduced-motion rule turns the animation off. Step timers (the recipe card and Cook mode) share `hooks/useStepTimers.js`.

## Weekly flyer import

The server checks hourly while awake and imports on Thursdays. A GitHub Action (`.github/workflows/flyer-import.yml`) wakes a sleeping free-tier server on Thursday and Friday. The details, including the secrets the action needs, are in the README and in [How the Flyers work](flyers-how-it-works.md).
