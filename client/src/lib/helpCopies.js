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
  swap: { kind: "pill", cls: "riso-btn outline-on-accent", label: "home.swap", onAccent: true },
  eatingOut: { kind: "pill", cls: "riso-btn outline-on-accent", label: "home.eatingOut", onAccent: true },
  openList: { kind: "pill", cls: "riso-btn ink", label: "home.openList", strong: true },
  addProteinToList: { kind: "pill", cls: "riso-protein-add", label: "proteins.addToList" },

  // Recipes
  expiringChip: { kind: "pill", cls: "riso-pill size-tag tone-pink", label: "recipes.d.usesExpiring" },
  saleChip: { kind: "pill", cls: "riso-pill size-tag tone-green", label: "recipes.d.onSale" },
  filterAll: { kind: "pill", cls: "riso-filter-chip", label: "recipes.filters.all" },
  filterMakeable: { kind: "pill", cls: "riso-filter-chip", label: "recipes.filters.makeable" },
  filterExpiring: { kind: "pill", cls: "riso-filter-chip", label: "recipes.filters.expiring" },
  filterMeals: { kind: "pill", cls: "riso-filter-chip", label: "recipes.filters.meals" },
  sourceCookbook: { kind: "pill", cls: "rv2-tab", label: "recipes.sources.cookbook" },
  sourceImported: { kind: "pill", cls: "rv2-tab", label: "recipes.sources.imported" },
  importRecipe: { kind: "pill", cls: "rv2-new", label: "recipes.importRecipe", strong: true },
  newRecipe: { kind: "pill", cls: "rv2-new", label: "recipes.newRecipe", strong: true },

  // Recipe card
  servingsMinus: { kind: "icon", cls: "riso-help-copy-stepper", glyph: "−" },
  servingsPlus: { kind: "icon", cls: "riso-help-copy-stepper", glyph: "+" },
  ingredientsTab: {
    kind: "group",
    cls: "riso-help-copy-tabs",
    items: [{ label: "recipeCard.ingredients", active: true }],
  },
  stepsTab: {
    kind: "group",
    cls: "riso-help-copy-tabs",
    items: [{ label: "recipeCard.steps", active: true }],
  },
  addMissing: { kind: "pill", cls: "riso-btn", label: "recipeCard.addMissing", vars: { count: 3 } },
  cardStartCooking: { kind: "pill", cls: "riso-rc-btn-primary", label: "recipeCard.startCooking", strong: true },
  planAround: { kind: "pill", cls: "riso-rc-btn-secondary", label: "recipeCard.planAround" },
  moreButton: { kind: "icon", cls: "riso-rc-round-btn", glyph: "⋯" },
  addToCookbook: { kind: "pill", cls: "riso-rc-btn-secondary", label: "recipeCard.addToCookbook" },
  moveToImported: { kind: "pill", cls: "riso-rc-btn-secondary", label: "recipeCard.moveToImported" },
  timerStart: { kind: "pill", cls: "riso-rc-timer-btn primary", label: "steps.start" },
  timerPause: { kind: "pill", cls: "riso-rc-timer-btn primary", label: "steps.pause" },
  timerResume: { kind: "pill", cls: "riso-rc-timer-btn primary", label: "steps.resume" },
  timerReset: { kind: "pill", cls: "riso-rc-timer-btn", label: "steps.reset" },
  editRecipe: { kind: "pill", cls: "riso-help-copy-menu", label: "recipeCard.editRecipe" },
  deleteRecipe: { kind: "pill", cls: "riso-help-copy-menu danger", label: "recipeCard.deleteRecipe" },

  // Cook mode
  pause: { kind: "pill", cls: "cm-timer-btn", label: "cookMode.pause" },
  plusMinute: { kind: "pill", cls: "cm-timer-btn", label: "cookMode.plusMinute" },
  reset: { kind: "pill", cls: "cm-timer-btn", label: "cookMode.reset" },
  keepAwake: { kind: "group", cls: "riso-help-copy-awake", switch: true, items: [{ label: "cookMode.keepAwake" }] },
  previous: { kind: "pill", cls: "cm-prev", label: "cookMode.previous" },
  nextStep: { kind: "pill", cls: "cm-next", label: "cookMode.nextStep", strong: true },
  markCooked: { kind: "pill", cls: "cm-btn primary", label: "cookMode.markCooked", strong: true },
  saveLeftovers: { kind: "pill", cls: "cm-btn primary", label: "cookMode.saveLeftovers", strong: true },

  // Planner
  weekPrev: { kind: "icon", cls: "riso-planner-nav-arrow", glyph: "‹" },
  weekNext: { kind: "icon", cls: "riso-planner-nav-arrow", glyph: "›" },
  copyLastWeek: { kind: "pill", cls: "riso-chip small", label: "planner.copyLastWeek" },
  fillEmpty: { kind: "pill", cls: "riso-btn", label: "planner.fillEmpty", vars: { count: 3 } },
  trayTabs: {
    kind: "group",
    cls: "riso-segmented",
    items: [{ label: "tray.tabSuggested", active: true }, { label: "tray.tabAround" }, { label: "tray.tabAll" }],
  },
  haveDot: { kind: "icon", cls: "rpm-have", glyph: "" },

  // Makeable
  useInventory: { kind: "group", cls: "riso-help-copy-toggle", switch: true, items: [{ label: "makeable.useInventory" }] },
  makeableMeals: { kind: "pill", cls: "riso-filter-chip", label: "makeable.types.meals" },
  showSales: { kind: "group", cls: "riso-help-copy-toggle", switch: true, items: [{ label: "makeable.showSales" }] },
  cookTonight: { kind: "pill", cls: "riso-makeable-action cook", label: "makeable.cookTonight", strong: true },

  // Grocery
  viewTabs: {
    kind: "group",
    cls: "riso-segmented",
    items: [{ label: "grocery.viewStore", active: true }, { label: "grocery.viewAisle" }, { label: "grocery.viewRecipe" }],
  },
  dealTag: { kind: "deal" },
  grip: { kind: "icon", cls: "riso-group-grip", glyph: "⠿" },
  rowCheck: { kind: "icon", cls: "riso-row-check", glyph: "" },
  rowRemove: { kind: "icon", cls: "riso-row-delete", glyph: "×" },
  removedChip: { kind: "removed" },
  share: { kind: "pill", cls: "riso-grocery-share", label: "grocery.share" },
  atStore: { kind: "atStore" },
  toInventory: { kind: "pill", cls: "riso-row-toinv", label: "grocery.toInventory" },
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
  addShelfPill: { kind: "icon", cls: "inv-shelf-edit inv-shelf-add", glyph: "+" },
  addItemHere: { kind: "icon", cls: "inv-shelf-edit inv-shelf-add", glyph: "+" },
  editShelf: { kind: "icon", cls: "inv-shelf-edit", glyph: "✎" },

  // Account, in the header
  langSwitch: { kind: "lang" },
  helpButton: { kind: "pill", cls: "btn subtle btn-sm", label: "app.help" },
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
  if (copy.kind === "deal") keys.push("same.sampleStore", "help.sample.price");
  if (copy.kind === "removed") keys.push("help.sample.item");
  if (copy.kind === "atStore") keys.push("grocery.atStore", "grocery.bigMode");
  if (copy.kind === "lang") keys.push("lang.label", "same.fr", "same.en");
  if (copy.kind === "avatar") keys.push("same.sampleInitial");
  return keys;
}
