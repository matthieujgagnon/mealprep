# Baseline audit notes (from repo matthieujgagnon/mealprep @ main, client/src/components)

Copy keys live in client/src/i18n/en.js and fr.js. Classes use the riso-* prefix; tokens like --riso-yellow, --riso-canvas, --riso-track are in index.css.

## Shell (App.jsx, RisoControls.jsx)
- Header: wordmark "matt mo [cookbook]", tabs (Home, Recipes, Planner, Makeable, Grocery, Flyers, Inventory), then FR | EN switch (LanguageSwitch, each in own language) and a round avatar button (first letter). Avatar menu: name, Help, Log out. Help is not a tab. On phone the tabs are a scrolling pill row. Header tightens (is-tight, is-tighter) on narrow desktop.
- Shared: Switch (48x28), Segmented (outlined pill, filled active), HintStrip ("how it works" dashed strip, "Got it", per user per screen), BottomSheet (phone), load-error banner with "Try again".
- Inventory confirmation sheet opens for EVERY add to Inventory (Done shopping, To inventory, receipt, "I have it", cook-mode leftovers). Lists name, amount, shelf, use-by; rows can be switched off; "Add N to inventory"; Cancel adds nothing.

## Login (AuthGate.jsx)
- Page: FR|EN top, pill "MEAL PREP" (auth.eyebrow), title (auth.title), card with blue offset shadow. Modes: login, signup (adds Name field + password hint, min 8), forgot (email, Send reset, then sent message, "Back to log in"), reset page (?token): new password, confirm, hint, "Go to log in". Error line under fields. "Forgot password?" link only in login.

## Home (Home.jsx)
- Greeting by hour (morning/afternoon/evening) + "<br>" + accent user name.
- Top row: hero card (tonight) + pink grocery card.
  - Hero states: recipe (photo, TONIGHT eyebrow, title, blurb "have all N / have x of y", buttons hot "Start cooking", outline "Swap", outline "Eating out" (if restaurant recipe exists)); note (emoji tile, title, pills "not from a recipe" + "nothing to prep", blurb, buttons "Pick a recipe", "Change in planner"); empty (nothing tonight / marked blank, "Add a recipe", "Eating out"). Yellow sticker "nothing to buy" when all on hand.
  - Grocery card: eyebrow GROCERY LIST, big number left to grab + unit, progress track, line "x in cart of y · n on sale", button "Open list". Done state: "groceries done" and "all N bought", hot button.
- Week strip: title "This week's dinners · n of 7 planned" (or "meals · n of 21"), chips This week / Next week, quiet toggle "all meals"/"dinners only". 7 day cards: photo, label "TUE 22" (TODAY), title; note cards plain text; empty "Plan"; past days greyscale no shadow. All-meals mode: columns with B/L/D rows.
- Bottom row (3 cards): Use it up (3 soonest-expiring with ItemPhoto, name, amount, badge "today!"/"tomorrow!" pink/yellow or "n days", freshness bar, note "uses two", button "Cook with these"), Makeable now (big count ready, "nearly n", up to 3 nearly rows with thumb, title, tag "missing n"/"ready", missing names, "+ List"/"listed"; button "Add all missing"), Proteins on sale (ProteinsOnSale, "See them").

## Recipes (RecipesDesktop.jsx >=768px, Recipes.jsx phone)
- Heading row: eyebrow "n recipes · n makeable now · n use expiring items", title "Your recipes.", button "+ New recipe".
- Search bar: label SEARCH (becomes IMPORT yellow for a URL), input, "paste a link" chip (or "Import recipe" button). URL: "link found" line. Import error line, "imported" toast. HintStrip recipes-v2.
- Tab row: Cookbook n / Imported n tabs; toolbar menus Protein, Time, Sort (yellow when not default). Sort: recent, fewest, quickest.
- Chips: All n | rule | Breakfast, Lunch, Dinner, Snack/Any, Pantry/Prep... (RECIPE_SLOTS) | gap | Makeable now, Uses expiring, Meals. Count line "n recipes" / "n match" + "Clear filters".
- Card: photo, name, time chip (⏱ or "add time"), meta "DINNER · CHICKEN", pink "uses expiring" and green "on sale" chips, have bar, label "all N on hand" green / "x of y on hand · n to buy". Cards with nothing to buy have the hard shadow (ready).

## Planner desktop (PlannerBoard.jsx, PlannerTray.jsx, App.jsx)
- Header left: ‹ week label › + badge "this week" (or chip "this week" when away) + chip "Copy last week" when empty; title "The week ahead."; right: button "Fill N empty slots" / "All slots filled". HintStrip planner-v5. No "Build grocery list" button here.
- Board: 7 day columns (all 7, scrolls; toggle "To the weekend →"/"Back to weekdays"), header "TODAY"/weekday + "Oct 5"; rows Breakfast, Lunch, Dinner. Cell states: empty (click to write on it), note card (textarea, 80 chars, emoji), meal card (photo, round "have it" button cycling plain, leftover, already have, remove ×, name), leftover sticker ("leftover" or "past fridge"), past days dim. Legend: have outline, leftover, write blank, scroll button.
- Tray (aside "Add recipes"): hint, target chip "Tue · Dinner ×", note input when slot selected, Segmented tabs Suggested / Plan around / All; Plan around: chip groups EXPIRING (pink), IN YOUR KITCHEN, YOUR PICKS; All: search. Tiles: photo with time, round + button, name, bar, meta "nothing to buy"/"x of y", reason. Group pills with titles.
- Phone: PlannerMobile (separate component, tray opens as BottomSheet with inSheet).

## Store mode (StoreMode.jsx) full-screen, dark default
- Head: ← back, store tabs, theme toggle ☀/☾ (stored); summary: big left count, "left at Metro", progress track, sort Section / A–Z (stored). List groups in aisle walking order with pill + rule + "n left"; rows are GroceryItem variant store (whole row checks, big qty); checked sink. Footer: "Done · N to inventory" (opens Inventory confirm; cancel stays).

## Makeable (WhatCanIMake.jsx)
- Heading eyebrow + "What can I make." HintStrip makeable-v2.
- Controls: Switch "Use inventory · n items", divider, Switch "Show sales"; "Also have" chip input row (stored locally).
- Search bar (SEARCH + input) + chips All/types with counts + Sort select (use it up, etc., A–Z).
- Groups: "Ready now" (blue pill n, note), "One or two short" (yellow), "Needs a shop" (paper). Card: photo (sticker "nothing to buy"), name, meta "35 MIN · 9 ingredients", "use it up" pill + names, "You need n" box rows (name, SaleTag, "+ Add"/"On list" button; max 4, then "and n more"), actions: "Cook tonight" or "Add all n"/"All on list" + Plan button ("Plan" or "✓ Tue · Dinner") which opens PlanPicker (day buttons MO..SU with numbers, meal buttons, note "replaces X"/"slot free", × close, "Plan for Tue · Dinner").

## Grocery (GroceryList.jsx, GroceryItem.jsx)
- Header: eyebrow "n to buy · n on sale", title "Grocery list.", Segmented By store / By aisle / By recipe, Share button (note "copied").
- Main: HintStrip, add form (input "2 lemons" + Add), groups. By store: group head with grip ⠿ (drag to reorder), store name (click to rename for own stores), count "n to buy · n on sale", × remove (own stores); rows draggable between stores; "+ Add store" form; empty "drag items here". Aisle/recipe: head without grip.
- Row (GroceryItem line): checkbox, name + meta line (brand, dot, recipes, narrow recipe qty), right cluster: "+ Inventory" once checked, deal tag (store | price) when unchecked, recipe amount (wide), editable qty input, ×. Checked: struck. Flyer-added rows open the deal.
- "Removed" strip: chips with ↺, "Clear". 
- Big pink button "I'm at the store · BIG MODE" (opens Store mode).
- Aside: cart card (eyebrow IN CART, big n, "items checked", track, "Done shopping (n)" button, note; dark "done" state, "Groceries done"); On sale card with yellow sticker "save", rows: photo, name, price, "Store · n% off", "ends Wed/tomorrow/today", copy; empty "no deals yet".
- Deal detail modal (DealDetailModal) on tap.

## Recipe card (RecipeDetailModal.jsx) is a MODAL over the page (overlay, Esc/outside click closes; Edit opens full-page editor)
- Hero photo (click opens lightbox ← → with count), buttons: "← Back" (left), round ⋯ menu and round × (right), sticker bottom-left: yellow "n things to buy" or green "nothing to buy", photo count chip "1 / 4" when several photos.
- ⋯ menu: Edit recipe, View original (link), Add to Cookbook / Move to Imported, "Leftovers keep… 3 days" (prompt), divider, Delete recipe (danger, confirm).
- Titlebar: title, meta line "30 min · Serves 4 · Keeps 3 days · From budgetbytes.com", tag chips (× to remove) + "add tag" input. Actions: primary "Start cooking" (only if steps), "Open original ↗" (link), secondary "Plan around this", secondary "Add to Cookbook"/"Move to Imported" + move note.
- Phone: tabs "Ingredients (n)" / "Steps (n)".
- Body: left Ingredients panel: header + servings stepper (− n servings +), have meter "x of y on hand" + track, "why" note (sticker "why?" + text), ingredient list clustered by group heading; row = dot (✓ when have), name + note + perishable dot, "use soon!" sticker (status soon), SaleTag (need), qty scaled. Tap row opens explainer: why text + actions: need → "+ Grocery list" (then "On grocery list ✓") and "I have it" (opens Inventory confirm); have → "I'm out of it" and "Open Inventory". Legend: in inventory, need to buy, use soon (only if any). Missing: button "Add n missing to grocery list" (becomes "added") or, when planned this week, note "✓ the n missing are already on your grocery list for Tuesday dinner · View list →".
- Right Steps: header "Steps" + "Quantities in the steps follow the servings", ordered list: section headings, number bubble, title, text (scaled), StepTimer, step thumb. Notes block "Your notes".
- Bottom: "Uses the same ingredients" grid (4): photo, title, "n shared". Optional "reuses ... from this week" note when opened from a suggestion.

## Cook mode (CookMode.jsx) full-screen overlay (not a page, opened from card "Start cooking" or Makeable "Cook tonight")
- Topbar: "← Back", title + meta "COOKING · Serves 4 · 30 min", segment bar (one per step, done/current), running-timer chip "⏱ 4:32" for other steps, "Keep awake" switch (wake lock), × exit (confirm if timer running).
- Step view: left: big step number circle, "STEP 2 OF 4", title, step text (auto-fits, 36px desktop/24 phone), "FOR THIS STEP" pills (tap to check, qty + name), timer on phone under text. Right aside: timer block (label TIMER/ROASTING…/TIME'S UP, big clock, buttons Start/Pause/Resume/Start again, +1 min, Reset), photo, "UP NEXT · STEP 3 · TITLE" button. Footer: Previous, "Step n of N", Next step / Finish. Swipe and arrows.
- Finished view: sticker "all done", title "Ready to eat." (readyStart + accent), copy, buttons "Mark cooked" (removes used items from Inventory) / "Back to step 1"; right "Save leftovers?" card: portions stepper, storage options Fridge (range) / Freezer (range), line "n portions to the fridge", button "Save leftovers" (opens Inventory confirm; fridge also plans leftover lunches) -> "Saved to Fridge".

## Planner phone (PlannerMobile.jsx)
- Top: range label, title "The week ahead." Week row: round ‹, week pill ("this week ▾" opens month calendar), round ›, hint "thu – sun →". Calendar popover: caret, "octobre 2026" (accent year), round ‹ ›, day letters, grid with dot for planned days, week yellow, today pink, legend "planned" / "today", button "Go to this week".
- Board: 7 columns (104px, gap 8), 3 in view, scrolls sideways, meal labels sticky left; heads TODAY/dow + num; rows Breakfast/Lunch/Dinner. Cells: empty "+ add", note (NOTE label + text, tap edit), card (photo, ✓ have, leftover/past fridge, title, time "25 MIN"). Fade at right edge. No drag on phone.
- Under board: "Fill n empty slots" button; bottom bar button "Make grocery list · n" (go to Grocery, n = items to buy).
- Tap a cell opens BottomSheet: if recipe: title + state label, chips "Open", "Mark as leftover"/"Mark as already have"/"Clear mark", "Remove"; if empty: "Write a note instead"; then PlannerTray inSheet (title "Add to Tue · Dinner").

## Inventory (Inventory.jsx, InventoryItemForm.jsx, InventoryConfirm.jsx)
- Header: summary "n items · n use soon · n expired" (expired pink), title "What you've got.", buttons "Scan receipt" and primary "+ Add item".
- HintStrip inventory-v2. Empty state text.
- Sticky shelf pill bar: Segmented tabs per shelf "Fridge 7 | Freezer 4 | Pantry 6" (lit = shelf in view, click scrolls), then round "+" to add a custom shelf (turns into name input).
- Shelves on a 12-column grid: Fridge and Freezer half, Pantry full. Custom shelves allowed, renameable, resizable (corner grip, 3/12 minimum, height from 200px or auto), reorderable by grip ⠿ (desktop only). Shelf header: grip, title, count, spacer, size label (editing), round "+" (add item here), round ✎ (edit mode: name input, width presets Full/Half/Third, Auto height, Delete shelf for custom, note "drag between shelves").
- Item card (inv-card): left expiry line filling from bottom (pink within 3 days, yellow within a week, blue after, none >=28 days or no date), photo (ItemPhoto), name (+ "Expired" tag), qty button "2 cans" (tap to edit inline − input + unit), round select checkbox. Sorted soonest first. Draggable between shelves (desktop). Click opens edit form. Empty shelf "Drop items here".
- Floating action bar on selection: "n selected", "Find recipes" (primary), "Used up", "Tossed", "Freeze", ×.
- Add/Edit form (desktop modal, phone BottomSheet): Add mode title "Add an item." (accent), hint, steps: 1 Name (input, "Recent" chips), 2 How much (− qty + unit select, quick chips), 3 Where · USDA (shelf cards with USDA range), 4 Use by (chips: days presets, No date, Pick a date; note text varies by kind: usda/rough/custom/expired/none). Edit mode: name input + category; steps "1 What's left", "2 Stored · USDA", "3 Use by", then "Done with it": Used up, Tossed, Freeze. Side: preview card of the inventory card, tag (e.g. "Use within 3 days"), "sorted by" line, staple toggle "Pantry staple", photo panel (drop, upload, or paste link; stock photo with "hide it"), recipes line "n recipes use X · See them", "Added this time · n" tray with Undo. Footer: Remove (desktop, left), Cancel, Save changes / "Add and next", "Add to inventory"; add mode: Cancel/Done. Toasts (yellow): "Item added", "Changes saved".
- Receipt scan modal: drop zone "Scan a receipt" label + hint, "reading…", found list, "Review n items" -> confirm sheet (title receiptTitle, intro receiptIntro).
- Inventory confirm sheet (modal, portal): title, intro, column heads Name / Amount / Shelf / Use by, rows: checkbox, name input, qty + unit select, shelf select, date input; suggestions fill shelf/date from USDA; footer Cancel + "Add N to inventory" (disabled when 0); error line.

## Recipes phone (Recipes.jsx RecipesPhone, <768px)
- Heading (eyebrow + "Your recipes."), NO "+ New recipe" in header: the search bar's right button is "+ New recipe" (becomes "Import recipe" for a URL). HintStrip recipes-v2.
- Source chips Cookbook n / Imported n (toggle, both shown when none), Sort select ("Sort ▾"). Protein select row ("Protein ▾", selected protein shows as a chip with emoji and ×). Filter chips: All, Makeable now, Uses expiring, Meals, then each meal slot (Breakfast, Lunch, Dinner, ...), each with count.
- Sections: "Cookbook" and "Imported" as collapsible blue bands (▾/▸, title, count, rule; folds remembered). Inside Cookbook: sub-sections by meal type (Breakfast, Lunch, Dinner, Snack, Dessert, Pantry/Prep, none), smaller plain headers, each folding. Grid of cards (2-up on phone). Card: photo (nothing over it), title, chips: yellow time chip (dashed "add time" if unset) and pink "uses expiring" (NO sale chip here), have bar + label.
- Empty: emptyNone / emptyNoMatch.

## Flyers (FlyerDeals.jsx) is NOT the "Riso Flyers Menu" design; it is the ingredient-grouped flyers page
- Title block, then AutoImportStrip (section.riso-auto-import): badge "Auto on/off", text "Every Thursday, imports ... from <stores> near <postal>", last run line, buttons "Check the import" (opens ImportReport: per-store table Store/From/Items/Price read/Per unit/Photos/Ends/Imported, compared line, history weeks chips, unreadable details, per-lb fix), "Settings" (postal code input, Switch "Import weekly · every Thursday", store chips from nearby Flipp stores, notes, Cancel/Save), primary "Import now"/"Importing…". Upload flyer form (store input, file, Extract).
- Briefing: three BriefPanels: accent blue panel with sticker "real deals!" (best deals, 6-month lows), plus two more (e.g. stock up / ends soon); each up to 4 rows: DealPhoto 56px, name, sub, price + store.
- Slices (Segmented SLICES): By category / Ends soon / Freezes well (stored). Rank menu (RANKS) and "Sales only" Switch (stored); collapsible groups (header caret ▾/▸ + title + count + rule; folds remembered; group shows 12 cards until "Show all"). Aisle groups in walking order.
- IngredientCard (article.riso-ing-card): photo/emoji cover, ends-soon badge, names (bilingual split), freezes short, a price tile per store (max 3, cheapest green), "low" state; open card spans the row and lists every store's product cheapest first with "+ List", plus PriceHistory: Quebec average box (month, price/unit, headline "stock-up price"/"near the usual"/"pricier", compare "n% less than Quebec", StatCan source), 6-month bars (current month green when good), Quebec marks, legend, lowest/average/highest stats, verdict "Would I buy it?" (Stock up / Fair / Wait) with reason.
- DealDetailModal (also used by Grocery): photo (6-MO LOW badge, page link), eyebrow "STORE · AISLE", name, brand, ends label, big price + unit, "Flyer says Reg. $x · n% off", Verdict, Quebec average box, history chart, freeze tip, "Also on sale" chips, "Open <store> flyer", "+ Add to list"/"On list", "Watch"/"Watching".
- Deal verdict/meter tokens: --riso-green for good, --riso-surface otherwise. Prices localized (fr: "1,99 $").
- NOTE: the earlier "Riso Flyers Menu" (Search bar + Slice by Category/Ends soon/Can freeze tabs + Store and Rank menus + store chips + collapsible groups + expandable price cards) is a different design than this page; check docs/flyers-how-it-works.md and e2e/flyers-riso.spec.js before replacing.

## Flyers rules (docs/flyers-how-it-works.md)
- Deals from Flipp each Thursday for stores near postal code (default Metro, IGA, Maxi, Super C, Provigo). Weekly price history; compared to same product same store (26 wks, >=2 wks), same product any store, else Statistics Canada Quebec average (6 months), else "New · no history yet".
- Verdicts (dealVerdict): Stock up, Buy, Skip, Only if you need it, Can't tell yet, Not a price (Points offer / Free with purchase / Worth $X). Quebec comparison: <= -25% stock-up, <= -10% good, to +10% normal, above high. Range position t: 0 low .. 1 high; meter good when t < .4; "low6" when t <= .05.
- One card per product with every store's price side by side. Home dashboard card "Proteins on sale": one row per Chicken, Beef, Pork, Fish, Seafood, Turkey, Lamb with best buy, store, price per lb, verdict, "n more really on sale"; "See them" opens Recipes filtered by that protein (Protein menu).
- Design refs in repo: docs/design/{grocery-item, inventory-item-form, planner-mobile, recipes-direction-a}/ (each README + .dc.html; Riso Planner Mobile, Riso Recipes v2, Riso Recipe Editor, Riso Add Item, Riso Inventory Item, Riso Grocery Item/Responsive). Styles: client/src/index.css with --riso-* tokens on .riso-theme; classes riso-chip, riso-btn, riso-eyebrow, riso-filter-chip.
- Languages: Quebec French first, all strings t(); i18n guards.

## Recipe editor (RecipeEditor.jsx) full page (tab stays Recipes)
- Back eyebrow "← RECIPES · NEW/EDITING", title "New recipe." / "Edit recipe." (accent). Two columns: form + sticky preview aside; sticky save bar bottom.
- Sections numbered 1–6: (1) The basics: Title input; Recipe link input + "↻ Re-import" button + help/result line (fills only empty fields); Planner slot radio chips (RECIPE_SLOTS, ✓ when on, click again clears) with slotHint; when editing also "Lives in" Cookbook/Imported radio chips + help. (2) Photos n: sortable tiles (drag to reorder, click = cover, "Cover" badge, × remove), "adding…" tiles, drop zone ("Drop pictures here" button opens picker, "or", URL input Enter), help line. (3) Time and servings, TOTAL: 4 steppers Servings, Prep (min), Cook (min), Leftovers keep (days; guessed note for new) each with help. (4) Ingredients n: grid labels QTY/UNIT/INGREDIENT/NOTE, sortable rows with ⠿ handle, qty (fractions), unit select, name, auto-grow note, ×; section-heading pills; buttons "+ Add ingredient" (soft), "+ Add section", dashed "Paste a whole list" opening textarea + "Add these"/"Close". (5) Instructions n: sortable steps ⠿ + number + auto-grow text (multi-line paste splits into steps, line ending ":" becomes heading), timer chip "⏱ 20 min" when text has a time, "+ photo" / step photo with ×, ×; heading rows as pills; foot: "+ Add step" (primary), "+ Add section heading", help; timers help. (6) Your notes OPTIONAL textarea.
- Preview aside: label HOW IT LOOKS IN YOUR COOKBOOK, card (photo with ⏱ chip or "add time", title or "Untitled", meta "n ingredients · serves 4", have bar, "x on hand · n to buy"), "Ready to plan?" checklist (title, time, slot, photo, ingredients+steps) with "n of 5", sort help.
- Save bar: error / "Unsaved changes" dot / "No changes", spacer, Cancel, "Save recipe" / "Save changes". Leave-unsaved confirm; beforeunload warning.

## Tokens (client/src/index.css .riso-theme)
canvas #f4f1ea, surface #fffdf8, track #e9e4d8, ink #16181f, soft #3f3e37, muted #5e5b52, dash #d6cfbf, dash-strong #bdb6a6, chip-dash #8a877d, placeholder #8a8677, faint #a9a394, store-checked #2a2d38, accent #2323ff, on-accent #fff, hot #ff48b0, yellow #ffe14d, green #10c95c, green-text #00753f, green-tint #e6f5ec, danger #c4123f. Shadows: --riso-shadow 3px 3px 0 ink; ready 5px; lg 8px; selected 4px 4px 0 accent; today 4px 4px 0 hot. Fonts: display Bricolage Grotesque, body Inter, mono DM Mono.
Existing project baseline already uses these colours; note danger #c4123f and store-checked #2a2d38 are new.
