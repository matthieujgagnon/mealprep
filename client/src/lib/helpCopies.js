// The small button copies drawn inside Help sentences. A Help line writes
// [[id]] where a button, chip, icon or tab is named; this table says what to
// draw for that id. Each copy is drawn with the app's own CSS classes and
// reads its words from the same dictionary keys the real control uses, so
// it follows the real one when the look or the label changes. (Help.jsx and
// HelpCopies.jsx do the drawing; i18n.test.js checks every [[id]] is here.)

export const COPY_TOKEN = /\[\[(\w+)\]\]/g;

// Kinds:
//   pill    one labelled control, drawn with `cls` (the app's own classes)
//   icon    a glyph-only control; hidden from screen readers because the
//           sentence already names it in words
//   group   a row of labelled segments in a `cls` wrapper (tabs, switches)
//   verdict a Flyers verdict label, coloured by its `tone`
//   deal, removed, atStore, lang, avatar: bigger pieces drawn in HelpCopies.jsx
// `label` is a dictionary key; `vars` are example values for its {placeholders}.
// `onAccent`: the real button sits on the blue block, so the copy gets blue behind it.
export const HELP_COPIES = {
  // Home: the Tonight card, the grocery card and Proteins on sale
  startCooking: { kind: "pill", cls: "riso-btn hot", label: "home.startCooking", strong: true },
  homeCooked: { kind: "pill", cls: "riso-btn outline-on-accent", label: "cooked.button", onAccent: true },
  swap: { kind: "pill", cls: "riso-btn outline-on-accent", label: "home.swap", onAccent: true },
  eatingOut: { kind: "pill", cls: "riso-btn outline-on-accent", label: "home.eatingOut", onAccent: true },
  openList: { kind: "pill", cls: "riso-btn ink", label: "home.openList", strong: true },
  addProteinToList: { kind: "pill", cls: "riso-protein-add", label: "proteins.addToList" },

  // Recipes
  filterAll: { kind: "pill", cls: "riso-filter-chip", label: "recipes.d.chipAll" },
  filterQuick: { kind: "pill", cls: "riso-filter-chip", label: "finder.quick" },
  sourceCookbook: { kind: "pill", cls: "rv2-tab", label: "recipes.sources.cookbook" },
  sourceImported: { kind: "pill", cls: "rv2-tab", label: "recipes.sources.imported" },
  importRecipe: { kind: "pill", cls: "rv2-new", label: "recipes.importRecipe", strong: true },
  newRecipe: { kind: "pill", cls: "rv2-new", label: "recipes.newRecipe", strong: true },

  // Recipe card (components/RecipeDetailModal.jsx, RecipeCardParts.jsx)
  servingsMinus: { kind: "icon", cls: "riso-rc-stepper-btn", glyph: "−" },
  servingsPlus: { kind: "icon", cls: "riso-rc-stepper-btn", glyph: "+" },
  addToList: { kind: "pill", cls: "riso-rc-add-all", label: "recipeCard.addToList" },
  cardStartCooking: { kind: "pill", cls: "riso-rc-start", label: "recipeCard.startCooking", strong: true },
  rcPlan: { kind: "pill", cls: "riso-rc-pill", label: "finder.plan" },
  rcSimilar: { kind: "pill", cls: "riso-rc-pill cream", label: "finder.similar" },
  rcOpenFull: { kind: "pill", cls: "riso-rc-pill", label: "recipeCard.openFullRecipe" },
  rcHaveIt: { kind: "pill", cls: "riso-rc-drawer-btn", label: "recipeCard.haveIt" },
  rcHaveAs: { kind: "pill", cls: "riso-rc-drawer-btn", label: "links.haveAs" },
  timerStart: { kind: "pill", cls: "riso-rc-timer-pill", label: "recipeCard.timerStart", vars: { time: "20 min" } },
  timerReset: { kind: "icon", cls: "riso-rc-timer-reset", glyph: "↺" },
  moreButton: { kind: "icon", cls: "riso-rc-round", glyph: "⋯" },
  planAround: { kind: "pill", cls: "riso-help-copy-menu", label: "recipeCard.planAround" },
  editRecipe: { kind: "pill", cls: "riso-help-copy-menu", label: "recipeCard.editRecipe" },
  addToCookbook: { kind: "pill", cls: "riso-help-copy-menu", label: "recipeCard.addToCookbook" },
  moveToImported: { kind: "pill", cls: "riso-help-copy-menu", label: "recipeCard.moveToImported" },
  hideFromMakeable: { kind: "pill", cls: "riso-help-copy-menu", label: "recipeCard.hideFromMakeable" },
  showInMakeable: { kind: "pill", cls: "riso-help-copy-menu", label: "recipeCard.showInMakeable" },
  deleteRecipe: { kind: "pill", cls: "riso-help-copy-menu danger", label: "recipeCard.deleteRecipe" },

  // Cook mode
  pause: { kind: "pill", cls: "cm-timer-main", label: "cookMode.pause" },
  plusMinute: { kind: "pill", cls: "cm-timer-btn", label: "cookMode.plusMinute" },
  reset: { kind: "icon", cls: "cm-timer-btn cm-timer-reset", glyph: "↺" },
  themeSwitch: { kind: "icon", cls: "riso-theme-switch", glyph: "☾" },
  keepAwake: { kind: "group", cls: "riso-help-copy-awake", switch: true, items: [{ label: "cookMode.keepAwake" }] },
  preparedMeal: { kind: "group", cls: "riso-help-copy-awake", switch: true, items: [{ label: "preparedMeal.switch" }] },
  previous: { kind: "pill", cls: "cm-prev", label: "cookMode.previous" },
  nextStep: { kind: "pill", cls: "cm-next", label: "cookMode.nextStep", strong: true },
  startStepOne: { kind: "pill", cls: "cm-next", label: "cookMode.prep.start", strong: true },
  // The finished view ("I cooked this", components/CookedView.jsx)
  iCookedThis: { kind: "pill", cls: "cm-next", label: "cooked.button", strong: true },
  addLeftovers: { kind: "pill", cls: "ck-btn primary", label: "cooked.leftovers.add", strong: true },
  noLeftovers: { kind: "pill", cls: "ck-btn", label: "cooked.leftovers.none" },
  removeFromInventory: { kind: "pill", cls: "ck-btn primary", label: "cooked.inventory.remove", strong: true },
  notNow: { kind: "pill", cls: "ck-btn", label: "cooked.inventory.notNow" },

  // Planner
  weekPrev: { kind: "icon", cls: "riso-planner-nav-arrow", glyph: "‹" },
  weekNext: { kind: "icon", cls: "riso-planner-nav-arrow", glyph: "›" },
  pageSticker: { kind: "pill", cls: "riso-pill size-tag tone-yellow sticker", label: "planner.stickerExample" },
  weekSticker: { kind: "pill", cls: "riso-pill size-tag tone-yellow sticker", label: "planner.thisWeekBadge" },
  goThisWeek: { kind: "pill", cls: "wcal-btn", label: "planner.goThisWeek" },
  copyLastWeek: { kind: "pill", cls: "wcal-btn", label: "planner.copyLastWeek" },
  clearDay: { kind: "pill", cls: "riso-planner-clear", label: "planner.clearDay" },
  weekendTag: { kind: "pill", cls: "riso-help-copy-weekend", label: "planner.weekendTag" },
  plannedCook: { kind: "pill", cls: "riso-plannedcard-btn primary", label: "planner.cook", strong: true },
  plannedCooked: { kind: "pill", cls: "riso-plannedcard-btn", label: "cooked.button" },
  plannedBase: { kind: "pill", cls: "riso-plannedcard-btn", label: "planner.useAsBase" },
  plannedReplace: { kind: "pill", cls: "riso-plannedcard-btn", label: "planner.replaceRecipe" },
  slotRecipe: { kind: "pill", cls: "riso-slotcard-btn recipe", label: "planner.slotRecipe", strong: true },
  slotNote: { kind: "pill", cls: "riso-slotcard-btn note", label: "planner.slotNote" },
  slotBlank: { kind: "pill", cls: "riso-slotcard-btn blank", label: "planner.slotBlank" },
  finderExpiring: { kind: "pill", cls: "riso-pill size-chip", label: "finder.expiring" },
  finderQuick: { kind: "pill", cls: "riso-pill size-chip", label: "finder.quick" },
  finderAddIngredient: { kind: "pill", cls: "fnd-add-ing", label: "finder.addIngredient" },
  removeNote: { kind: "pill", cls: "riso-slotcard-remove", label: "planner.removeNote" },
  leftoversBtn: { kind: "pill", cls: "fnd-main-btn", label: "finder.placeLeftovers" },
  chipHaveAs: { kind: "icon", cls: "ing-marks-haveas", glyph: "≈" },
  haveDot: { kind: "icon", cls: "riso-help-copy-have", glyph: "" },

  // Makeable
  includeSides: { kind: "pill", cls: "riso-pill size-chip", label: "makeable.includeSides" },
  showAgain: { kind: "pill", cls: "riso-removed-putback", label: "makeable.hidden.showAgain" },
  finderReady: { kind: "pill", cls: "riso-pill size-chip", label: "finder.avail.ready" },
  finderFew: { kind: "pill", cls: "riso-pill size-chip", label: "finder.avail.few" },
  showSales: { kind: "pill", cls: "riso-pill size-chip", label: "makeable.showSales" },
  cardCook: { kind: "pill", cls: "mkc-btn main", label: "makeable.card.cook", strong: true },
  cardPlan: { kind: "pill", cls: "mkc-btn", label: "makeable.card.plan" },
  cardBuy: { kind: "pill", cls: "mkc-btn main", label: "makeable.card.buy", strong: true },
  cardAdded: { kind: "pill", cls: "mkc-btn done", label: "makeable.card.added" },

  // Grocery
  viewTabs: {
    kind: "group",
    cls: "riso-segmented",
    items: [{ label: "grocery.viewStore", active: true }, { label: "grocery.viewAisle" }, { label: "grocery.viewRecipe" }],
  },
  dealTag: { kind: "deal" },
  grip: { kind: "icon", cls: "riso-group-grip", glyph: "⠿" },
  rowCheck: { kind: "icon", cls: "riso-row-check", glyph: "" },
  rowBought: { kind: "icon", cls: "riso-row-check on", glyph: "✓" },
  rowQueued: { kind: "icon", cls: "riso-row-check on queued", glyph: "+" },
  addQueued: { kind: "pill", cls: "riso-group-foot-btn", label: "grocery.addQueued", vars: { count: 2 }, strong: true },
  rowRemove: { kind: "icon", cls: "riso-row-delete", glyph: "×" },
  rowHaveAs: { kind: "pill", cls: "riso-row-haveas", label: "links.haveAs" },
  removedChip: { kind: "removed" },
  putBackOnList: { kind: "pill", cls: "riso-removed-putback", label: "grocery.putBackOnList" },
  share: { kind: "pill", cls: "riso-grocery-share", label: "grocery.share" },
  atStore: { kind: "atStore" },
  doneShopping: { kind: "pill", cls: "riso-grocery-cart-btn", label: "grocery.doneShopping", vars: { count: 3 }, strong: true },

  // Flyers
  settings: { kind: "pill", cls: "riso-btn", label: "flyers.settings" },
  importNow: { kind: "pill", cls: "riso-btn primary", label: "flyers.importNow", strong: true },
  checkImport: { kind: "pill", cls: "riso-btn", label: "flyers.checkImport" },
  uploadFlyer: { kind: "pill", cls: "riso-btn", label: "flyers.uploadFlyer" },
  salesOnly: { kind: "pill", cls: "riso-slice-chip sale", label: "flyers.salesOnly" },
  sliceCategory: { kind: "pill", cls: "riso-slice-chip", label: "flyers.sliceCategory" },
  sliceEnds: { kind: "pill", cls: "riso-slice-chip", label: "flyers.sliceEnds" },
  sliceFreeze: { kind: "pill", cls: "riso-slice-chip", label: "flyers.sliceFreeze" },
  rankBest: { kind: "pill", cls: "riso-slice-chip", label: "deals.rankBest" },
  rankGap: { kind: "pill", cls: "riso-slice-chip", label: "deals.rankGap" },
  rankCheapest: { kind: "pill", cls: "riso-slice-chip", label: "deals.rankCheapest" },
  rankAz: { kind: "pill", cls: "riso-slice-chip", label: "deals.rankAz" },
  watch: { kind: "pill", cls: "riso-deal-detail-watch", label: "flyers.watch" },
  verdictStockUp: { kind: "verdict", tone: "stock-up", label: "deals.verdictStockUp" },
  verdictBuy: { kind: "verdict", tone: "buy", label: "deals.verdictBuy" },
  verdictSkip: { kind: "verdict", tone: "skip", label: "deals.verdictSkip" },
  verdictFair: { kind: "verdict", tone: "fair", label: "deals.verdictFair" },
  verdictUnknown: { kind: "verdict", tone: "unknown", label: "deals.verdictCantTell" },
  verdictNotPrice: { kind: "verdict", tone: "unknown", label: "deals.verdictNotPrice" },

  // Inventory
  addItem: { kind: "pill", cls: "riso-inv-btn primary", label: "inventory.addItem", strong: true },
  scanReceipt: { kind: "pill", cls: "riso-inv-btn", label: "inventory.scanReceipt" },
  addAndNext: { kind: "pill", cls: "riso-itemform-btn", label: "inventory.form.addAndNext" },
  addToInventory: { kind: "pill", cls: "riso-itemform-btn primary", label: "inventory.form.addToInventory", strong: true },
  saveChanges: { kind: "pill", cls: "riso-itemform-btn primary", label: "inventory.form.saveChanges", strong: true },
  usedUp: { kind: "pill", cls: "inv-action-btn", label: "inventory.usedUp", dark: true },
  tossed: { kind: "pill", cls: "inv-action-btn", label: "inventory.tossed", dark: true },
  freeze: { kind: "pill", cls: "inv-action-btn", label: "inventory.freeze", dark: true },
  addSection: { kind: "pill", cls: "riso-inv-btn", label: "inventory.addSection" },
  viewToggle: {
    kind: "group",
    cls: "riso-segmented inset",
    items: [{ label: "inventory.viewCompact" }, { label: "inventory.viewTiles", active: true }],
  },
  shelfGrip: { kind: "icon", cls: "inv-shelf-grip", glyph: "⠿" },
  addItemHere: { kind: "icon", cls: "inv-shelf-edit inv-shelf-add", glyph: "+" },
  putBack: { kind: "pill", cls: "riso-removed-putback", label: "inventory.removed.putBack" },
  thaw: { kind: "pill", cls: "inv-card-thaw", label: "inventory.thaw" },
  reviewStorage: { kind: "pill", cls: "riso-inv-btn", label: "inventory.storageBanner.review" },
  sortThem: { kind: "pill", cls: "riso-inv-btn", label: "recipes.sorting.open" },
  leftoversChip: { kind: "pill", cls: "riso-itemform-chip small on", label: "inventory.form.leftovers" },
  editShelf: { kind: "icon", cls: "inv-shelf-edit", glyph: "✎" },
  // The Delete shelf sheet's button, and Bring back in + Add section (components/InventoryShelfSheets.jsx).
  deleteShelf: { kind: "pill", cls: "riso-btn primary", label: "inventory.deleteShelf", strong: true },
  bringBack: { kind: "pill", cls: "riso-btn small", label: "inventory.addShelfSheet.bringBack" },

  // Account, in the header
  langSwitch: { kind: "lang" },
  helpButton: { kind: "pill", cls: "btn subtle btn-sm", label: "app.help" },
  feedbackButton: { kind: "pill", cls: "btn subtle btn-sm", label: "feedback.menu" },
  logOutButton: { kind: "pill", cls: "btn subtle btn-sm", label: "app.logOut" },
  avatar: { kind: "avatar" },

  // FAQ
  reimport: { kind: "pill", cls: "riso-btn", label: "editor.reimport" },
};

// The dictionary keys a copy reads, for the guard test.
export function copyKeys(copy) {
  const keys = [];
  if (copy.label) keys.push(copy.label);
  for (const item of copy.items || []) keys.push(item.label);
  if (copy.kind === "deal") keys.push("help.sample.price");
  if (copy.kind === "removed") keys.push("help.sample.item");
  if (copy.kind === "atStore") keys.push("grocery.atStore", "grocery.bigMode");
  if (copy.kind === "lang") keys.push("lang.label", "same.fr", "same.en");
  if (copy.kind === "avatar") keys.push("same.sampleInitial");
  return keys;
}
