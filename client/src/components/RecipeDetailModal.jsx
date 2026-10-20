import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { stepImage, stepIsHeading } from "../lib/steps.js";
import { findDealsFor, findSaleDeal } from "../lib/similarRecipes.js";
import { expiringItemsIn, linkBehind, matchingItems } from "../lib/inventoryMatch.js";
import { plannedDayOf, recipeIngredientNames, similarTo } from "../lib/finder.js";
import { rankRecipesForTray } from "../lib/plannerSuggestions.js";
import { MEAL_PRICING_READY, cardSteps, groceryItemOf, receiptTotals, recipeReceipt, stepServings } from "../lib/recipeCard.js";
import { loadStorePrefs, namedStoreFor, storeSetup } from "../lib/groceryStores.js";
import { groceryCore } from "../lib/groceryDedupe.js";
import { groceryShared } from "../lib/groceryCache.js";
import { useDeals } from "../lib/dealsStore.js";
import { formatRecipeTime, isPreparedRecipe } from "../lib/mealSlots.js";
import { formatMoney } from "../i18n/format.js";
import { useStepTimers } from "../hooks/useStepTimers.js";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { CookMode } from "./CookMode.jsx";
import { useInventoryLinks } from "./InventoryLinkPopup.jsx";
import { PlannedPill } from "./RisoPills.jsx";
import { BuySticker, OptionsMenu, PhotoLightbox, PricesSwitch, Receipt, SimilarStrip, SimilarView, StepList } from "./RecipeCardParts.jsx";
import { t } from "../i18n/index.js";

// The recipe card (design: docs/design/riso-v2-recipe-card/): the one card every
// page opens (Recipes, the Planner, Makeable, Home and Grocery), over the page it
// was opened from. App.jsx renders it once (`openRecipeCard`).
//
// On a computer: the photo with the receipt under it on the left (To buy, In your
// Inventory), and on the right the title, the fact line, Start cooking / Plan /
// Similar recipes / Open full recipe ↗, the steps on Cook mode's rail and Notes;
// "Uses the same ingredients" runs along the bottom. On a phone: one column that
// scrolls, with Start cooking and Plan in a bar fixed at the bottom.
//
// Similar recipes swaps the card's content for the Similar view; ← Back puts the
// recipe back as it was (servings, current step, running timers and the Prices
// setting all live up here and are never reset by it).
//
// Prices wait for Meal pricing (lib/recipeCard.js MEAL_PRICING_READY): until it
// ships no $ amount and no Prices switch show.
//
// Props:
//   recipe, from (the box of the card it grows out of), backLabel (the page it was
//   opened from: "← Planner"), onClose
//   allRecipes, plannedEntries (this week's and the upcoming entries, for the
//   "Planned Wednesday" pill and "use soon"), upcomingEntries (from today on, for
//   the similar search's ranking), kitchen (App's { inventory }), grocery
//   (App's one { isOnList, add, toggle, addWithUndo })
//   onSelectRecipe(recipe)   another recipe's card (Similar, the footer)
//   onPlan(recipe)           the shared slot picker
//   onPlanAround(recipe)     the Planner's Main meal (the ⋯ menu)
//   onEdit(recipe), onDelete(recipe) (App deletes it with the toast's Undo),
//   onRecipeUpdated(updated), onRequestInventoryAdd (the confirmation sheet),
//   onDeletePantryItem, onFinishCooking, onNavigate(tab), onToast(message, undo?)

const CLOSE_MS = 220;
// Overlays that open above the card and close with their own Escape.
const ABOVE_CARD = ".riso-picker-backdrop, .riso-confirm-overlay, .riso-link-layer, .rc-lightbox-overlay, .riso-deal-backdrop, .riso-ask-backdrop, .ck-sheet-backdrop, .ck-screen";
const NOTE_SAVE_MS = 900;

export function RecipeDetailModal({
  recipe,
  from = null,
  backLabel,
  onClose: close,
  allRecipes = [],
  plannedEntries = [],
  upcomingEntries = [],
  kitchen,
  grocery,
  onSelectRecipe,
  onPlan,
  onPlanAround,
  onEdit,
  onDelete,
  onRecipeUpdated,
  onRequestInventoryAdd,
  onDeletePantryItem,
  onFinishCooking,
  onNavigate,
  onToast,
}) {
  const phone = useIsPhone();
  const { deals } = useDeals();
  const inventory = kitchen?.inventory || [];
  const baseServings = recipe.baseServings || 4;

  const [servings, setServings] = useState(baseServings);
  const [currentStep, setCurrentStep] = useState(0);
  const [similarOpen, setSimilarOpen] = useState(false);
  const [leftOut, setLeftOut] = useState([]);
  // Prices on or off. Saved per account by the Meal pricing ticket; until then the
  // switch is not shown and this never changes.
  const [showPrices, setShowPrices] = useState(true);
  const [cookModeOn, setCookModeOn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openRow, setOpenRow] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(null);
  const [lightbox, setLightbox] = useState(null); // { photos, index }
  const [brokenPhotos, setBrokenPhotos] = useState(() => new Set());
  const [closing, setClosing] = useState(false);
  const [origin, setOrigin] = useState(null);
  // Shared with Cook mode: a time changed there, or a timer started here, carries over.
  const stepTimers = useStepTimers({ title: recipe.title, recipeId: recipe.id });

  const cardRef = useRef(null);
  const closeRef = useRef(null);
  const scrollRef = useRef(null);

  const scale = servings / (recipe.baseServings || 1);
  const pricesOn = MEAL_PRICING_READY && showPrices;

  // ---- Closing, Escape, focus ---------------------------------------------------
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  function onClose() {
    if (closing) return;
    if (reduced) return close();
    setClosing(true);
    setTimeout(close, CLOSE_MS);
  }
  const latest = useRef({});
  latest.current = { onClose, menuOpen, cookModeOn };

  // The card grows out of the card that was tapped (and shrinks back into it).
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el || !from) return;
    const box = el.getBoundingClientRect();
    setOrigin(`${from.left + from.width / 2 - box.left}px ${from.top + from.height / 2 - box.top}px`);
  }, [from]);

  useEffect(() => {
    function onKey(e) {
      const now = latest.current;
      if (now.cookModeOn || document.querySelector(ABOVE_CARD)) return;
      if (e.key === "Escape") {
        if (now.menuOpen) setMenuOpen(false);
        else now.onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  // ---- Photos ---------------------------------------------------------------------
  // Step photos live in the steps, not in the gallery (the same picture would show
  // twice). Older recipes have only photoUrl.
  const gallery = useMemo(() => {
    const inSteps = new Set((recipe.instructions || []).map(stepImage).filter(Boolean));
    const raw = recipe.photos?.length ? recipe.photos : recipe.photoUrl ? [recipe.photoUrl] : [];
    return [...new Set(raw)].filter((u) => !inSteps.has(u) && !brokenPhotos.has(u));
  }, [recipe.photos, recipe.photoUrl, recipe.instructions, brokenPhotos]);
  // It opens on the cover photo (photoUrl), wherever it sits in the gallery.
  const shownIndex = photoIndex ?? Math.max(0, gallery.indexOf(recipe.photoUrl));
  const heroPhoto = gallery[shownIndex] ?? gallery[0] ?? null;

  // ← → flip the cover photo (not while typing a note, or with the viewer open).
  useEffect(() => {
    function onKey(e) {
      if (lightbox || gallery.length < 2 || similarOpen || cookModeOn) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (step) setPhotoIndex((i) => ((i ?? shownIndex) + step + gallery.length) % gallery.length);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [gallery.length, lightbox, similarOpen, cookModeOn, shownIndex]);

  const openGallery = () => heroPhoto && setLightbox({ photos: gallery, index: shownIndex });

  // ---- The receipt ----------------------------------------------------------------
  const soonItems = useMemo(() => expiringItemsIn(recipe, inventory, plannedEntries, allRecipes), [recipe, inventory, plannedEntries, allRecipes]);
  const receipt = useMemo(() => recipeReceipt(recipe, kitchen, servings, { soonItems }), [recipe, kitchen, servings, soonItems]);
  const totals = pricesOn ? receiptTotals(receipt.buy, receipt.have, servings) : null;

  // The store each thing to buy is filed under on the Grocery page (the same rule:
  // lib/groceryStores.js), from your stores, your per-item choices and the flyers.
  const [sections, setSections] = useState(() => groceryShared.sections || []);
  useEffect(() => {
    if (groceryShared.sections) return undefined;
    let cancelled = false;
    api
      .listGrocerySections()
      .then((rows) => !cancelled && setSections(rows || []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const storeSet = useMemo(() => storeSetup(sections, deals), [sections, deals]);
  const storePrefs = useMemo(loadStorePrefs, []);
  const dealOf = (row) => findSaleDeal(row.name, deals);
  const dealsOf = (row) => findDealsFor(row.name, deals);
  const storeOf = (row) => namedStoreFor(groceryCore(row.name), findDealsFor(row.name, deals)[0] || null, storeSet, storePrefs);

  // A row's mark: on the list -> off (the shared toast has Undo); off -> on, with
  // how much more for a food you're short of.
  function toggleRow(row) {
    if (grocery.isOnList(row.name)) grocery.toggle(row.name);
    else grocery.add([groceryItemOf(row)]);
  }

  // "I'm out of this": the Inventory items that are this food leave Inventory
  // (Recently removed lists them as Used up).
  async function outOfIt(row) {
    if (!onDeletePantryItem) return;
    for (const item of matchingItems(row.name, inventory, { prepared: isPreparedRecipe(recipe) })) await onDeletePantryItem(item.id, { how: "consumed" });
    setOpenRow(null);
  }

  // "I have it": the Inventory confirmation sheet; nothing is added before it is confirmed.
  function haveIt(row) {
    const draft = { ref: row.name, name: row.name };
    // A prepared recipe is had by a prepared meal, so that is what is added (the sheet says so).
    if (isPreparedRecipe(recipe)) draft.isPreparedMeal = true;
    if (row.short && row.need.quantity != null) Object.assign(draft, { quantity: row.need.quantity, unit: row.need.unit });
    onRequestInventoryAdd?.([draft], { title: t("inventoryConfirm.haveItTitle") });
  }

  // "I have it as…": you keep it under another name. The pop-up links the two names (it
  // adds nothing to Inventory). A blue row that is blue only because of such a link says
  // so in its drawer, with Remove.
  const links = useInventoryLinks();
  const haveAs = (row) => links.ask(row.names, { label: row.name });
  const becauseOf = (row) => {
    const found = linkBehind(row.names, inventory);
    return found && { link: found.link, onRemove: () => links.remove([found.link]) };
  };

  // ---- Steps ------------------------------------------------------------------------
  const steps = useMemo(() => cardSteps(recipe.instructions || []), [recipe.instructions]);
  const stepCount = steps.filter((s) => !s.heading).length;
  const canCook = (recipe.instructions || []).some((s) => !stepIsHeading(s));

  // ---- Similar recipes ----------------------------------------------------------
  const ranked = useMemo(() => rankRecipesForTray({ recipes: allRecipes, upcomingEntries, kitchen }).ranked, [allRecipes, upcomingEntries, kitchen]);
  const chips = useMemo(() => recipeIngredientNames(recipe), [recipe]);
  const footerTiles = useMemo(() => similarTo(recipe, ranked).slice(0, 4), [recipe, ranked]);
  const similarTiles = useMemo(() => (similarOpen ? similarTo(recipe, ranked, leftOut) : []), [similarOpen, recipe, ranked, leftOut]);
  const toggleChip = (core) => setLeftOut((prev) => (prev.includes(core) ? prev.filter((c) => c !== core) : [...prev, core]));
  // The Similar view and the recipe each start at the top (the phone's scroll
  // area, or the computer's overlay).
  const toTop = () => (scrollRef.current || cardRef.current?.parentElement)?.scrollTo?.(0, 0);
  function openSimilar() {
    setSimilarOpen(true);
    toTop();
  }
  function closeSimilar() {
    setSimilarOpen(false);
    toTop();
  }

  // ---- Notes (saved with the recipe, a moment after typing stops) ------------------
  const [note, setNote] = useState(recipe.notes || "");
  const savedNote = useRef(recipe.notes || "");
  const noteTimer = useRef(null);
  const latestNote = useRef(note);
  latestNote.current = note;
  async function saveNote() {
    clearTimeout(noteTimer.current);
    const text = latestNote.current;
    if (text.trim() === savedNote.current.trim()) return;
    savedNote.current = text;
    try {
      const updated = await api.updateRecipe(recipe.id, { notes: text.trim() });
      onRecipeUpdated?.(updated);
    } catch {
      savedNote.current = "";
      onToast?.(t("recipeCard.noteFailed"));
    }
  }
  const saveNoteRef = useRef(saveNote);
  saveNoteRef.current = saveNote;
  // Closing the card saves what was typed.
  useEffect(() => () => saveNoteRef.current(), []);

  // ---- The ⋯ menu -------------------------------------------------------------------
  async function moveRecipe() {
    setMenuOpen(false);
    const toCookbook = !recipe.inCookbook;
    try {
      const updated = await api.updateRecipe(recipe.id, { inCookbook: toCookbook });
      onRecipeUpdated?.(updated);
      onToast?.(t(`recipeCard.moveNote.${toCookbook ? "cookbook" : "imported"}`), async () => {
        const back = await api.updateRecipe(recipe.id, { inCookbook: !toCookbook });
        onRecipeUpdated?.(back);
      });
    } catch {
      onToast?.(t("recipeCard.moveNote.error"));
    }
  }

  // ---- Pieces both layouts share -------------------------------------------------------
  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
  const plannedDay = plannedDayOf(recipe.id, plannedEntries);
  const buyCount = receipt.buy.length;

  const factLine = (
    <div className="riso-rc-facts">
      {[
        totalTime > 0 && <b key="time">{formatRecipeTime(totalTime)}</b>,
        <span key="serves">
          {t("recipeCard.servesPrefix")} <b>{servings}</b>
        </span>,
        pricesOn && totals?.priced > 0 && (
          <span key="price" className="riso-rc-facts-price">
            <mark>{t("recipeCard.estimate", { price: formatMoney(totals.meal) })}</mark>
            {!phone && totals.perServing != null && <small>{t("recipeCard.perServing", { price: formatMoney(totals.perServing) })}</small>}
          </span>
        ),
        recipe.fridgeLifeDays ? (
          <span key="keeps">
            {t("recipeCard.keepsPrefix")} <b>{t("recipeCard.days", { count: recipe.fridgeLifeDays })}</b>
          </span>
        ) : null,
      ]
        .filter(Boolean)
        .map((part, i) => (
          <span key={i} className="riso-rc-fact">
            {i > 0 && (
              <span className="riso-rc-fact-sep" aria-hidden="true">
                ·
              </span>
            )}
            {part}
          </span>
        ))}
      {plannedDay != null && <PlannedPill dayOfWeek={plannedDay} className="riso-rc-planned" />}
    </div>
  );

  const menuButton = !recipe.isPlaceholder && (
    <span className="riso-rc-menu-wrap">
      <button type="button" className={`riso-rc-round${menuOpen ? " on" : ""}`} aria-label={t("recipeCard.moreActions")} aria-expanded={menuOpen} title={t("recipeCard.more")} onClick={() => setMenuOpen((o) => !o)}>
        ⋯
      </button>
      {menuOpen && (
        <OptionsMenu
          recipe={recipe}
          onPlanAround={
            onPlanAround &&
            (() => {
              setMenuOpen(false);
              onPlanAround(recipe);
            })
          }
          onEdit={() => {
            setMenuOpen(false);
            onEdit?.(recipe);
          }}
          onMove={moveRecipe}
          onDelete={() => {
            setMenuOpen(false);
            onDelete?.(recipe);
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </span>
  );
  const closeButton = (
    <button ref={closeRef} type="button" className="riso-rc-round" aria-label={t("recipeCard.close")} title={t("recipeCard.closeEsc")} onClick={onClose}>
      ×
    </button>
  );

  const startCooking = canCook && (
    <button type="button" className="riso-rc-start" onClick={() => setCookModeOn(true)}>
      {t("recipeCard.startCooking")}
    </button>
  );
  const planButton = onPlan && !recipe.isPlaceholder && (
    <button type="button" className="riso-rc-pill" onClick={() => onPlan(recipe)}>
      {t("finder.plan")}
    </button>
  );
  const similarButton = (
    <button type="button" className="riso-rc-pill cream" onClick={openSimilar}>
      {t("finder.similar")}
    </button>
  );
  const sourceSite = recipe.sourceUrl ? safeHost(recipe.sourceUrl) : null;
  const fullRecipeButton = recipe.sourceUrl && (
    <a className="riso-rc-pill" href={recipe.sourceUrl} target="_blank" rel="noreferrer" title={sourceSite ? t("recipeCard.opensInTab", { site: sourceSite }) : undefined}>
      {phone ? t("recipeCard.fullRecipe") : t("recipeCard.openFullRecipe")}
    </a>
  );
  const pricesSwitch = MEAL_PRICING_READY && <PricesSwitch on={showPrices} onToggle={() => setShowPrices((on) => !on)} />;

  const sticker = !recipe.isPlaceholder && <BuySticker count={buyCount} className={phone ? "on-photo" : "on-receipt"} />;

  const photo = (
    <div className="riso-rc-photo">
      {heroPhoto ? (
        <img src={heroPhoto} alt={recipe.title} className="riso-rc-photo-img" onClick={openGallery} onError={() => setBrokenPhotos((prev) => new Set(prev).add(heroPhoto))} />
      ) : (
        <div className="riso-rc-photo-img placeholder" />
      )}
      {phone ? (
        <div className="riso-rc-photo-top">
          <button type="button" className="riso-rc-round" aria-label={t("recipeCard.backTo", { page: backLabel })} onClick={onClose}>
            ←
          </button>
          <span className="riso-rc-spacer" />
          {menuButton}
          {closeButton}
        </div>
      ) : (
        <button type="button" className="riso-rc-back" onClick={onClose}>
          {t("recipeCard.back", { page: backLabel })}
        </button>
      )}
      {phone && sticker}
      {gallery.length > 1 && (
        <button type="button" className="riso-rc-photo-count" title={t("recipeCard.openPhotos")} onClick={openGallery}>
          {phone ? t("same.fraction", { n: shownIndex + 1, total: gallery.length }) : t("recipeCard.photoCount", { n: shownIndex + 1, total: gallery.length })}
        </button>
      )}
    </div>
  );

  const receiptNode = (
    <Receipt
      receipt={receipt}
      servings={servings}
      onStepServings={(delta) => setServings((s) => stepServings(s, delta))}
      sticker={phone ? null : sticker}
      grocery={grocery}
      storeOf={storeOf}
      dealOf={dealOf}
      dealsOf={dealsOf}
      pricesOn={pricesOn}
      totals={totals}
      openKey={openRow}
      onOpenRow={(key) => setOpenRow((prev) => (prev === key ? null : key))}
      onToggleRow={toggleRow}
      onAddAll={(rows) => grocery.addWithUndo(rows.map(groceryItemOf))}
      onViewList={() => onNavigate?.("grocery")}
      onHaveIt={haveIt}
      onHaveAs={links ? haveAs : undefined}
      becauseOf={links ? becauseOf : undefined}
      onOutOfIt={outOfIt}
      onOpenInventory={() => onNavigate?.("inventory")}
    />
  );

  const stepsNode = (
    <StepList
      steps={steps}
      current={currentStep}
      total={stepCount}
      onCurrent={setCurrentStep}
      recipe={recipe}
      scale={scale}
      stepTimers={stepTimers}
      phone={phone}
      onPhoto={(url) => setLightbox({ photos: [url], index: 0 })}
    />
  );

  const notesNode = (
    <section className="riso-rc-notes">
      <label className="riso-rc-caps" htmlFor={`rc-notes-${recipe.id}`}>
        {t("recipeCard.notes")}
      </label>
      <textarea
        id={`rc-notes-${recipe.id}`}
        rows={3}
        value={note}
        placeholder={t("recipeCard.notePlaceholder")}
        onChange={(e) => {
          setNote(e.target.value);
          clearTimeout(noteTimer.current);
          noteTimer.current = setTimeout(() => saveNoteRef.current(), NOTE_SAVE_MS);
        }}
        onBlur={() => saveNoteRef.current()}
      />
    </section>
  );

  const footer = <SimilarStrip tiles={footerTiles} onOpen={(match) => onSelectRecipe?.(match)} />;

  const similarView = similarOpen && (
    <SimilarView
      recipe={recipe}
      chips={chips}
      leftOut={leftOut}
      onToggleChip={toggleChip}
      tiles={similarTiles}
      onOpen={(match) => onSelectRecipe?.(match)}
      onBack={closeSimilar}
      onClose={onClose}
      phone={phone}
    />
  );

  // ---- Layouts ----------------------------------------------------------------------
  const content = phone ? (
    <>
      <div className="riso-rc-scroll" ref={scrollRef}>
        {similarOpen ? (
          similarView
        ) : (
          <>
            {photo}
            <header className="riso-rc-head">
              <h1 className="riso-rc-title">{recipe.title}</h1>
              {factLine}
              <div className="riso-rc-actions">
                {similarButton}
                {fullRecipeButton}
              </div>
              {pricesSwitch && (
                <div className="riso-rc-prices-row">
                  {totals?.perServing != null && <span className="riso-rc-caps">{t("recipeCard.perServing", { price: formatMoney(totals.perServing) })}</span>}
                  {pricesSwitch}
                </div>
              )}
            </header>
            <div className="riso-rc-receipt-wrap">{receiptNode}</div>
            {stepsNode}
            {notesNode}
            {footer}
          </>
        )}
      </div>
      {!similarOpen && (startCooking || planButton) && (
        <div className="riso-rc-bottombar">
          {startCooking}
          {planButton}
        </div>
      )}
    </>
  ) : similarOpen ? (
    similarView
  ) : (
    <>
      <div className="riso-rc-grid">
        <div className="riso-rc-left">
          {photo}
          <div className="riso-rc-receipt-wrap">{receiptNode}</div>
        </div>
        <div className="riso-rc-right">
          <header className="riso-rc-head">
            <div className="riso-rc-topbar">
              {menuButton}
              {closeButton}
            </div>
            <div className="riso-rc-titlearea">
              <h1 className="riso-rc-title">{recipe.title}</h1>
              {factLine}
            </div>
            <div className="riso-rc-actions">
              {startCooking}
              {planButton}
              {similarButton}
              {fullRecipeButton}
              <span className="riso-rc-spacer" />
              {pricesSwitch}
            </div>
          </header>
          {stepsNode}
          {notesNode}
        </div>
      </div>
      {footer}
    </>
  );

  return (
    <div className={`riso-theme riso-rc-overlay${phone ? " phone" : ""}${closing ? " closing" : ""}`} data-theme="light" onClick={onClose}>
      <div
        ref={cardRef}
        className={`riso-rc-card${phone ? " phone" : ""}${similarOpen ? " similar" : ""}${closing ? " closing" : ""}`}
        style={origin ? { transformOrigin: origin } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={recipe.title}
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
      {lightbox && (
        <PhotoLightbox
          photos={lightbox.photos}
          index={lightbox.index}
          onIndex={(index) => {
            setLightbox((lb) => ({ ...lb, index }));
            if (lightbox.photos === gallery) setPhotoIndex(index);
          }}
          onClose={() => setLightbox(null)}
        />
      )}
      {cookModeOn && (
        <CookMode
          recipe={recipe}
          servings={servings}
          onExit={() => setCookModeOn(false)}
          onFinish={(served, hooks) => onFinishCooking?.(recipe, served, { ...hooks, onExitCook: () => setCookModeOn(false) })}
          stepTimers={stepTimers}
        />
      )}
    </div>
  );
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
