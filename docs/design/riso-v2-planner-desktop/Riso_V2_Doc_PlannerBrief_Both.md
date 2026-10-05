# Planner: how the page works today (brief for the side-menu rework)

Source: matthieujgagnon/mealprep, `PlannerBoard.jsx`, `PlannerTray.jsx`, `PlannerMobile.jsx`, `lib/plannerSlots.js`, `lib/plannerSuggestions.js`, `server/src/routes/planner.js`. The design copy is `Riso_V2_Page_PlannerOld_Desktop` (desktop and phone). Items marked "not checked" are in `App.jsx`, which I have not read in full.

## 1. What the page is for
Plan one week at a time: 7 days x 3 meals (Breakfast, Lunch, Supper). Everything planned feeds the grocery list, and what is on hand or marked as leftovers is taken off that list.

## 2. Layout
- Desktop: title, "How it works" strip, week picker + "Fill N empty slots", then two blocks side by side: the board (about 5 of 7 days visible, weekend by scrolling) and the side menu ("Add recipes", 320px, sticky).
- Phone: the same board as 7 columns (104px each, about 3 in view) with a week pill, a month calendar, and a bottom bar "Make the grocery list · N". The side menu becomes a bottom sheet that opens when a cell is tapped.

## 3. A slot (one day + one meal) holds one thing
| Kind | What it is | Stored as |
| --- | --- | --- |
| Recipe card | photo, name; flags: leftover, already have | planner entry pointing at a recipe |
| Note | free text up to 80 characters, emoji-only notes show big | planner entry pointing at a placeholder recipe whose title is the text |
| Blank card | "no meal planned" (eating out, skipping) | placeholder recipe titled "No meal planned" |
| Empty | nothing yet, dashed | no entry |

Older plans can hold two entries in one slot; the board shows the first, and placing into the slot replaces all.

## 4. Card states
- Plain: counts toward the grocery list.
- Leftover (yellow "leftover" sticker): comes from an earlier meal; nothing from it goes on the list. Turns pink "past fridge life" when the days since the first non-leftover placement of the same recipe exceed the recipe's fridge life.
- Already have (blue outline, check): nothing from it goes on the list.
- The round button on the card cycles plain, then leftover, then already have, then plain.
- Past days are grey and dimmed.

## 5. Actions on the board
- Click an empty slot: select it (blue). The side menu shows "Add to Tue · Supper", a note box, and the recipe list.
- Place a recipe: drag a tile onto any slot, or press + (goes into the selected slot, else the next empty one).
- Next empty slot order: upcoming days first (today onward on the current week), and inside a day Supper, then Lunch, then Breakfast.
- Move a card: drag it to another slot (also across weeks through the API).
- Write a note: select an empty slot, type in the side menu note box, Enter.
- Blank card: a slot marked "no meal planned"; click it again to clear.
- Remove: the x on a card.
- Fill N empty slots: fills every empty upcoming slot (rule not checked in App.jsx).
- Copy last week's plan: shown only when the week is empty; copies every entry, resets leftover and already-have flags, skips recipes already in the same slot.
- Week navigation: arrows, "this week" badge or chip. Phone adds a month calendar (dot under days with meals, current week yellow, today pink).

## 6. The side menu ("Add recipes")
Header, target chip (the selected slot, with x), one-line hint that changes with the target, note box (appears when a slot is selected), then three tabs.

1. Suggested: up to three groups, each recipe in at most one.
   - "Uses what's expiring" (pink): up to 3 recipes using ingredients that expire within 7 days and are not yet in a planned meal.
   - "Nothing to buy" (yellow): up to 2 recipes with every ingredient on hand.
   - With no inventory yet it falls back to a "top" group of 5.
2. Plan around: pick ingredient chips (Expiring in pink, In your kitchen, Your picks); the list shows recipes using the most picked ingredients (max 6) with "uses X and Y".
3. All: search box (title or ingredient), alphabetical.

Tiles are small recipe cards: photo with time, + button, name, have-bar, "nothing to buy" or "N to buy · x of y on hand", and a one-line reason.

Ranking score per recipe: expiring ingredients used x2, plus (2 if nothing missing, else minus 0.5 per missing item), plus 0.5 per ingredient shared with the planned week, minus 1.5 if already planned this week. Pantry/prep, sides and desserts never fill a meal slot on their own (rules exist in `plannerSuggestions.js`).

## 7. Data the page needs
Entries for the shown week (and "upcoming" from today across weeks for the ranking and grocery list), recipes with ingredients, inventory with expiry dates (what is on hand and what is expiring), planned dates for the phone calendar.

## 8. Questions for the side menu rework
1. Today the side menu only adds. Should it also hold search and the recipe itself (open a recipe without leaving the Planner)? Opening a recipe currently leaves the page.
2. Search currently lives only in the All tab. Should search sit above all three tabs and filter whatever tab is open?
3. Tabs: keep three, or merge Suggested and Plan around into one list with filters (expiring, nothing to buy, uses X)?
4. On phone the same content is a bottom sheet over the board. Should the phone get a full-screen picker instead, so the board is not hidden while choosing?
5. Should "write a note" and "leave blank" be equal options next to "add a recipe" (the phone sheet now does this), on desktop too?
6. Should placing a recipe ask for servings or leftovers at the same time (the data model has servings, but the board never shows it)?
7. What should the tray say after the week is full (it keeps suggesting)?

## 9. Not covered
Drag-and-drop feel, keyboard use, French copy checks, and the grocery list rules that read from these flags.
