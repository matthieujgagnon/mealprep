import { useEffect } from "react";
import { RecipePhoto } from "./RecipePhoto.jsx";
import { RecipePhotoCard } from "./RecipePhotoCard.jsx";
import { SaleTag } from "./SaleTag.jsx";
import { formatClock, stepBody, stepImage, stepIngredients, stepTitle, scaleStepText, stepHeadingText } from "../lib/steps.js";
import { amountText, nextCurrent, stepState, timerPill, stepSeconds } from "../lib/recipeCard.js";
import { lineNeed } from "../lib/inventoryMatch.js";
import { captionTime, cardCaption } from "../lib/photoCard.js";
import { isHiddenFromMakeable, isPreparedRecipe, recipeSlotCaption, recipeTotalMinutes } from "../lib/mealSlots.js";
import { formatExpiry, LOCATIONS } from "../lib/pantryInventory.js";
import { storageOf } from "../lib/shelves.js";
import { formatMoney } from "../i18n/format.js";
import { t } from "../i18n/index.js";

// The pieces of the recipe card (components/RecipeDetailModal.jsx; design:
// docs/design/riso-v2-recipe-card/). RecipeDetailModal keeps the state and lays
// them out for a computer or a phone; these only draw.

// ---- The ⋯ menu -----------------------------------------------------------------

// Plan around this, Edit, View original, Add to my Cookbook (or Move to Imported),
// Hide from Makeable (or Show in Makeable), then Delete. (How long the leftovers keep is in
// Edit recipe, with the other details.) A transparent catcher behind it closes it on any
// click outside.
export function OptionsMenu({ recipe, onPlanAround, onEdit, onMove, onToggleMakeable, onDelete, onClose }) {
  return (
    <>
      <div className="riso-rc-menu-catcher" onClick={onClose} />
      <div className="riso-rc-menu" role="menu">
        {onPlanAround && (
          <button type="button" role="menuitem" onClick={onPlanAround}>
            {t("recipeCard.planAround")}
          </button>
        )}
        <button type="button" role="menuitem" onClick={onEdit}>
          {t("recipeCard.editRecipe")}
        </button>
        {recipe.sourceUrl && (
          <a role="menuitem" href={recipe.sourceUrl} target="_blank" rel="noreferrer" onClick={onClose}>
            {t("recipeCard.viewOriginal")}
          </a>
        )}
        <button type="button" role="menuitem" onClick={onMove}>
          {recipe.inCookbook ? t("recipeCard.moveToImported") : t("recipeCard.addToCookbook")}
        </button>
        {onToggleMakeable && (
          <button type="button" role="menuitem" onClick={onToggleMakeable}>
            {isHiddenFromMakeable(recipe) ? t("recipeCard.showInMakeable") : t("recipeCard.hideFromMakeable")}
          </button>
        )}
        <div className="riso-rc-menu-divider" />
        <button type="button" role="menuitem" className="danger" onClick={onDelete}>
          {t("recipeCard.deleteRecipe")}
        </button>
      </div>
    </>
  );
}

// ---- Photos -----------------------------------------------------------------------

// The full-size photo viewer: ← → flip through the photos, Escape (or the ×, or a
// click outside the photo) closes it, and only it, not the recipe.
export function PhotoLightbox({ photos, index, onIndex, onClose }) {
  const url = photos[index];
  useEffect(() => {
    function onKey(e) {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (e.key !== "Escape" && !step) return;
      // Caught on the way down, before the recipe card's own Escape.
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") onClose();
      else if (photos.length > 1) onIndex((index + step + photos.length) % photos.length);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, photos.length, onIndex, onClose]);

  return (
    <div className="rc-lightbox-overlay" role="dialog" aria-label={t("recipeCard.photos")} onClick={onClose}>
      <button type="button" className="rc-lightbox-close" onClick={onClose} aria-label={t("recipeCard.closePhotos")} title={t("recipeCard.closeEsc")}>
        ×
      </button>
      {photos.length > 1 && (
        <button
          type="button"
          className="rc-lightbox-arrow left"
          onClick={(e) => {
            e.stopPropagation();
            onIndex((index - 1 + photos.length) % photos.length);
          }}
          aria-label={t("recipeCard.prevPhoto")}
        >
          ‹
        </button>
      )}
      <img src={url} alt="" className="rc-lightbox-photo" onClick={(e) => e.stopPropagation()} />
      {photos.length > 1 && (
        <button
          type="button"
          className="rc-lightbox-arrow right"
          onClick={(e) => {
            e.stopPropagation();
            onIndex((index + 1) % photos.length);
          }}
          aria-label={t("recipeCard.nextPhoto")}
        >
          ›
        </button>
      )}
      {photos.length > 1 && (
        <span className="rc-lightbox-count">
          {index + 1} / {photos.length}
        </span>
      )}
    </div>
  );
}

// ---- The receipt ------------------------------------------------------------------

// "{n} things to buy" (yellow), or "Nothing to buy" (blue: you have everything).
export function BuySticker({ count, className = "" }) {
  return (
    <span className={`riso-rc-sticker${count > 0 ? "" : " ready"} ${className}`.trim()}>
      {count > 0 ? t("recipeCard.thingsToBuy", { count }) : t("recipeCard.nothingToBuy")}
    </span>
  );
}

// The servings stepper: − and + one at a time, never under 1.
export function ServingsStepper({ servings, onStep }) {
  return (
    <span className="riso-rc-stepper">
      <button type="button" className="riso-rc-stepper-btn" aria-label={t("recipeCard.decreaseServings")} disabled={servings <= 1} onClick={() => onStep(-1)}>
        −
      </button>
      <span className="riso-rc-stepper-value" aria-live="polite">
        {t("recipeCard.servings", { count: servings })}
      </span>
      <button type="button" className="riso-rc-stepper-btn" aria-label={t("recipeCard.increaseServings")} onClick={() => onStep(1)}>
        +
      </button>
    </span>
  );
}

// A price and where it comes from (SALE on yellow, FLYER, MEDIAN). Only drawn once
// Meal pricing gives rows a price (lib/recipeCard.js MEAL_PRICING_READY).
function RowPrice({ row }) {
  if (!Number.isFinite(row.price)) return null;
  return (
    <span className="riso-rc-price">
      <span className="riso-rc-price-amount">{formatMoney(row.price)}</span>
      {row.source && <span className={`riso-rc-source ${row.source}`}>{t(`recipeCard.sources.${row.source}`)}</span>}
    </span>
  );
}

// "in your freezer": where the item is KEPT (a shelf of its own says nothing about that), or
// just "Inventory" while that is not known yet.
function locationLabel(item) {
  const kept = storageOf(item);
  return kept ? LOCATIONS.find((l) => l.id === kept).label : t("recipeCard.inventory");
}

// What tapping a row opens under it: why it is where it is, and what can be done.
// A thing to buy: put it on the grocery list or take it off, "I have it" (the
// Inventory confirmation sheet; nothing is added before it is confirmed) or "I have it
// as…" (you keep it under another name: it links the two names and adds nothing).
// Something in your Inventory: "I'm out of this" and "Open in Inventory", and when the
// row is blue only because you said so, which link did it, with Remove (`because`).
function RowDrawer({ row, kind, servings, onList, onToggleList, onHaveIt, onHaveAs, because, onOutOfIt, onOpenInventory }) {
  const where = (row.item ? locationLabel(row.item) : t("recipeCard.inventory")).toLowerCase();
  let why;
  if (kind === "buy") {
    why = row.short ? t("recipeCard.whyShort", { count: servings }) : onList ? t("recipeCard.whyOnList") : t("recipeCard.whyNeed");
  } else if (row.soon) {
    const expiry = row.item?.expiresAt ? formatExpiry(row.item.expiresAt).toLowerCase() : t("recipeCard.soon");
    why = t("recipeCard.whySoon", { where, expiry });
  } else {
    why = t("recipeCard.whyHave", { where });
  }
  return (
    <div className="riso-rc-drawer">
      <p>{why}</p>
      <div className="riso-rc-drawer-actions">
        {kind === "buy" ? (
          <>
            <button type="button" className={`riso-rc-drawer-btn primary${onList ? " added" : ""}`} onClick={onToggleList}>
              {onList ? t("recipeCard.takeOffList") : t("recipeCard.addOne")}
            </button>
            <button type="button" className="riso-rc-drawer-btn" onClick={onHaveIt}>
              {t("recipeCard.haveIt")}
            </button>
            {onHaveAs && !row.short && (
              <button type="button" className="riso-rc-drawer-btn" onClick={onHaveAs}>
                {t("links.haveAs")}
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="riso-rc-drawer-btn" onClick={onOutOfIt}>
              {t("recipeCard.outOfIt")}
            </button>
            <button type="button" className="riso-rc-drawer-btn" onClick={onOpenInventory}>
              {t("recipeCard.openInventory")}
            </button>
          </>
        )}
      </div>
      {kind === "have" && because && (
        <p className="riso-rc-because">
          {t("links.because", { item: because.link.itemLabel, recipe: because.link.recipeLabel })}{" "}
          <button type="button" className="riso-rc-link" onClick={because.onRemove}>
            {t("links.remove")}
          </button>
        </p>
      )}
    </div>
  );
}

// The muted words after a name: the prep notes ("minced").
function RowNotes({ row }) {
  return row.notes.length ? <span className="riso-rc-row-note"> {row.notes.join(", ")}</span> : null;
}

// One thing to buy: the round mark (green ✓ on your grocery list, white + not;
// tapping it puts it on or takes it off, with the shared toast's Undo), the name,
// the meta line (amount · store · ON YOUR LIST, or "400 G MORE · METRO" for a food
// you're short of; the recipe's group when it has groups) and on the right the real
// sale tag (it opens the deal card), or the price once Meal pricing ships.
function BuyRow({ row, open, onOpen, onList, store, deal, dealOthers, pricesOn, onToggleList, drawer }) {
  const meta = [
    row.short ? t("recipeCard.amountMore", { amount: row.amount }) : row.amount,
    store,
    onList ? t("recipeCard.onYourList") : null,
    ...row.groups,
  ].filter(Boolean);
  return (
    <li className={`riso-rc-buy${open ? " open" : ""}`}>
      <div className="riso-rc-buy-line">
        <button
          type="button"
          className={`riso-rc-mark${onList ? " onlist" : ""}`}
          aria-pressed={onList}
          aria-label={onList ? t("finder.takeOffListAria", { name: row.name }) : t("makeable.addToList", { name: row.name })}
          title={onList ? t("finder.onListTitle") : t("makeable.addToListTitle")}
          onClick={onToggleList}
        >
          {onList ? "✓" : "+"}
        </button>
        <button type="button" className="riso-rc-buy-main" aria-expanded={open} onClick={onOpen}>
          <span className="riso-rc-buy-name">
            {row.name}
            <RowNotes row={row} />
          </span>
          {meta.length > 0 && <span className="riso-rc-buy-meta">{meta.join(" · ")}</span>}
        </button>
        <span className="riso-rc-buy-side">
          {pricesOn ? <RowPrice row={row} /> : <SaleTag deal={deal} others={dealOthers} />}
        </span>
      </div>
      {open && drawer}
    </li>
  );
}

// One thing from your Inventory: the name (and "Use soon!" when it goes off within
// 3 days and no other planned meal uses it), the amount this recipe uses.
function HaveRow({ row, open, onOpen, pricesOn, drawer }) {
  return (
    <li className={`riso-rc-have${open ? " open" : ""}`}>
      <button type="button" className="riso-rc-have-line" aria-expanded={open} onClick={onOpen}>
        <span className="riso-rc-have-name">
          {row.name}
          <RowNotes row={row} />
          {row.soon && <span className="riso-rc-use-soon">{t("recipeCard.useSoon")}</span>}
        </span>
        <span className="riso-rc-have-qty">{row.amount}</span>
        {pricesOn && <RowPrice row={row} />}
      </button>
      {open && drawer}
    </li>
  );
}

// The receipt: TO BUY with the servings stepper, the things to buy, "Add to grocery
// list", then In your Inventory and (once Meal pricing ships, with Prices on) the
// totals.
export function Receipt({
  receipt,
  servings,
  onStepServings,
  sticker,
  grocery,
  storeOf,
  dealOf,
  dealsOf,
  pricesOn,
  totals,
  openKey,
  onOpenRow,
  onToggleRow,
  onAddAll,
  onViewList,
  onHaveIt,
  onHaveAs,
  becauseOf,
  onOutOfIt,
  onOpenInventory,
}) {
  const { buy, have } = receipt;
  const notListed = buy.filter((row) => !grocery.isOnList(row.name));
  const drawerFor = (row, kind) => (
    <RowDrawer
      row={row}
      kind={kind}
      servings={servings}
      onList={grocery.isOnList(row.name)}
      onToggleList={() => onToggleRow(row)}
      onHaveIt={() => onHaveIt(row)}
      onHaveAs={onHaveAs && (() => onHaveAs(row))}
      because={kind === "have" ? becauseOf?.(row) : null}
      onOutOfIt={() => onOutOfIt(row)}
      onOpenInventory={onOpenInventory}
    />
  );
  return (
    <div className="riso-rc-receipt">
      {sticker}
      <div className="riso-rc-receipt-head">
        <span className="riso-rc-caps">{t("recipeCard.toBuyHead", { count: buy.length })}</span>
        <ServingsStepper servings={servings} onStep={onStepServings} />
      </div>
      {buy.length > 0 ? (
        <ul className="riso-rc-buy-list">
          {buy.map((row) => (
            <BuyRow
              key={row.key}
              row={row}
              open={openKey === `buy:${row.key}`}
              onOpen={() => onOpenRow(`buy:${row.key}`)}
              onList={grocery.isOnList(row.name)}
              store={storeOf(row)}
              deal={dealOf(row)}
              dealOthers={dealsOf(row)}
              pricesOn={pricesOn}
              onToggleList={() => onToggleRow(row)}
              drawer={drawerFor(row, "buy")}
            />
          ))}
        </ul>
      ) : (
        <p className="riso-rc-receipt-empty">{t("recipeCard.nothingToBuyLine")}</p>
      )}
      {pricesOn && totals && buy.length > 0 && (
        <div className="riso-rc-total">
          <span>{t("recipeCard.toBuyTotal")}</span>
          <span>{t("recipeCard.estimate", { price: formatMoney(totals.toBuy) })}</span>
        </div>
      )}
      {buy.length > 0 &&
        (notListed.length > 0 ? (
          <button type="button" className="riso-rc-add-all" onClick={() => onAddAll(notListed)}>
            {t("recipeCard.addToList")}
          </button>
        ) : (
          <p className="riso-rc-all-listed">
            <span className="riso-rc-all-listed-mark" aria-hidden="true">
              ✓
            </span>
            {t("recipeCard.allListed")}{" "}
            <button type="button" className="riso-rc-link" onClick={onViewList}>
              {t("recipeCard.viewList")}
            </button>
          </p>
        ))}

      <div className="riso-rc-have-head">
        <span className="riso-rc-have-mark" aria-hidden="true">
          ✓
        </span>
        <span>{t("recipeCard.inInventoryCount", { count: have.length })}</span>
      </div>
      {have.length > 0 ? (
        <ul className="riso-rc-have-list">
          {have.map((row) => (
            <HaveRow key={row.key} row={row} open={openKey === `have:${row.key}`} onOpen={() => onOpenRow(`have:${row.key}`)} pricesOn={pricesOn} drawer={drawerFor(row, "have")} />
          ))}
        </ul>
      ) : (
        <p className="riso-rc-receipt-empty">{t("recipeCard.haveNone")}</p>
      )}

      {pricesOn && totals && (
        <div className="riso-rc-totals">
          <div className="riso-rc-total soft">
            <span>{t("recipeCard.fromInventory")}</span>
            <span>{t("recipeCard.estimate", { price: formatMoney(totals.fromInventory) })}</span>
          </div>
          <div className="riso-rc-meal">
            <span className="riso-rc-meal-label">
              <span>{t("recipeCard.thisMeal")}</span>
              {totals.perServing != null && <span className="riso-rc-meal-per">{t("recipeCard.perServingA", { price: formatMoney(totals.perServing) })}</span>}
            </span>
            <span className="riso-rc-meal-total">{t("recipeCard.estimate", { price: formatMoney(totals.meal) })}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- The Prices switch --------------------------------------------------------------

// Shown only once Meal pricing ships: hides every price on the card when off.
export function PricesSwitch({ on, onToggle }) {
  return (
    <button type="button" className={`riso-rc-prices${on ? " on" : ""}`} role="switch" aria-checked={on} onClick={onToggle}>
      {t("recipeCard.prices")}
      <span className="riso-rc-prices-track" aria-hidden="true">
        <span className="riso-rc-prices-knob" />
      </span>
    </button>
  );
}

// ---- Steps ------------------------------------------------------------------------

// "20 min", "1 h", "1 h 30 min": a timer's length on its idle pill ("1:30" when it
// isn't whole minutes, as a time changed in Cook mode can be).
function shortDuration(seconds) {
  if (seconds % 60) return formatClock(seconds);
  const minutes = seconds / 60;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return t("same.durMin", { m });
  return m ? t("same.durHMin", { h, m }) : t("same.durH", { h });
}

// A step's timer pill (pressing it never changes the current step): Start, then
// Pause while it runs, Resume when paused, and Time's up (press to start again).
// The round ↺ resets it, shown once it has started. The timers are the recipe's
// shared ones (hooks/useStepTimers.js), so Cook mode shows the same.
export function TimerPill({ timerKey, seconds, stepTimers }) {
  const state = stepTimers.stateFor(timerKey, seconds);
  const { kind, started } = timerPill(state);
  const time = shortDuration(state.total);
  const clock = formatClock(state.remaining);
  const label = kind === "running" ? `❚❚  ${clock}` : kind === "paused" ? `▶  ${clock}` : kind === "done" ? `✓  ${t("cookMode.timeUp")}` : `▶  ${t("recipeCard.timerStart", { time })}`;
  const says = t(`recipeCard.timerAria.${kind}`, { time, clock });
  return (
    <span className="riso-rc-timer" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={`riso-rc-timer-pill ${kind}`} title={says} aria-label={says} onClick={() => stepTimers.toggle(timerKey, seconds)}>
        {label}
      </button>
      {started && (
        <button type="button" className="riso-rc-timer-reset" title={t("steps.reset")} aria-label={t("steps.reset")} onClick={() => stepTimers.reset(timerKey)}>
          ↺
        </button>
      )}
    </span>
  );
}

// "USES · 900 G CHICKEN THIGHS · 1 CUP PLAIN YOGURT": what the current step uses, by
// the same matching as Cook mode's "For this step" (stepIngredients), scaled.
function StepUses({ step, ingredients, scale }) {
  const items = stepIngredients(step, ingredients);
  if (items.length === 0) return null;
  const words = items.map((ing) => [amountText(lineNeed([ing], scale)), ing.name].filter(Boolean).join(" "));
  return <p className="riso-rc-step-uses">{t("recipeCard.uses", { items: words.join(" · ") })}</p>;
}

// The steps on Cook mode's rail: done steps are ink with ✓, the current one blue and
// bigger, the rest white; a dotted line joins them. Clicking a row makes it current;
// clicking the current one marks it done and moves on. A section label ("For the
// sauce") sits between the rows, unnumbered. `phone` puts the timer under the text.
export function StepList({ steps, current, total, onCurrent, recipe, scale, stepTimers, phone, onPhoto }) {
  if (total === 0) {
    return (
      <section className="riso-rc-steps">
        <div className="riso-rc-steps-head">
          <span className="riso-rc-caps">{t("recipeCard.stepsHead", { count: 0 })}</span>
        </div>
        <p className="riso-rc-nosteps">{t("recipeCard.noSteps")}</p>
      </section>
    );
  }
  return (
    <section className="riso-rc-steps">
      <div className="riso-rc-steps-head">
        <span className="riso-rc-caps">{t("recipeCard.stepsHead", { count: total })}</span>
        <span className="riso-rc-caps accent">{current >= total ? t("recipeCard.allDone") : t("recipeCard.stepOf", { n: current + 1, total })}</span>
      </div>
      <ol className="riso-rc-step-list">
        {steps.map((s) => {
          if (s.heading) {
            return (
              <li key={s.key} className="riso-rc-step-label">
                {stepHeadingText(s.step)}
              </li>
            );
          }
          const state = stepState(s.index, current);
          const title = stepTitle(s.step);
          const body = scale === 1 ? stepBody(s.step) : scaleStepText(s.step, scale);
          const seconds = stepSeconds(s.step);
          const image = stepImage(s.step);
          const last = s.index === total - 1;
          const timer = seconds ? <TimerPill timerKey={s.key} seconds={seconds} stepTimers={stepTimers} /> : null;
          return (
            <li key={s.key} className={`riso-rc-step ${state}${last ? " last" : ""}`} onClick={() => onCurrent(nextCurrent(s.index, current))}>
              <span className="riso-rc-rail">
                <button
                  type="button"
                  className="riso-rc-dot"
                  aria-current={state === "current" ? "step" : undefined}
                  aria-label={title ? t("cookMode.stepLabelTitle", { n: s.index + 1, title }) : t("cookMode.stepLabel", { n: s.index + 1 })}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCurrent(nextCurrent(s.index, current));
                  }}
                >
                  {state === "done" ? "✓" : s.index + 1}
                </button>
                {!last && <span className="riso-rc-rail-line" aria-hidden="true" />}
              </span>
              <div className="riso-rc-step-text">
                <span className="riso-rc-step-title">{title || t("recipeCard.stepLabel", { n: s.index + 1 })}</span>
                <p className="riso-rc-step-body">{body}</p>
                {state === "current" && <StepUses step={s.step} ingredients={recipe.ingredients} scale={scale} />}
                {image && (
                  <button
                    type="button"
                    className="riso-rc-step-photo"
                    aria-label={t("recipeCard.stepPhoto", { n: s.index + 1 })}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPhoto(image);
                    }}
                  >
                    <img src={image} alt="" />
                  </button>
                )}
                {phone && timer}
              </div>
              {!phone && <div className="riso-rc-step-timer">{timer}</div>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---- Similar recipes ----------------------------------------------------------------

// "{n} SHARED", the yellow sticker on a similar recipe's photo.
function SharedSticker({ count }) {
  return <span className="riso-rc-shared">{t("recipeCard.shared", { count })}</span>;
}

// The footer, "Uses the same ingredients": the top four of the same search as the
// Similar view, with nothing left out. Photo cards (RecipePhotoCard "strip"):
// the photo with the "{n} SHARED" sticker, the name and the time under it.
export function SimilarStrip({ tiles, onOpen }) {
  if (tiles.length === 0) return null;
  return (
    <section className="riso-rc-strip">
      <div className="riso-rc-strip-head">
        <h3>{t("recipeCard.similarTitle")}</h3>
        <span>{t("recipeCard.similarNote")}</span>
      </div>
      <div className="riso-rc-strip-cards">
        {tiles.map((x) => (
          <RecipePhotoCard
            key={x.recipe.id}
            variant="strip"
            title={x.recipe.title}
            photoUrl={x.recipe.photoUrl}
            caption={<SharedSticker count={x.shared.length} />}
            openLabel={t("planner.open", { title: x.recipe.title })}
            onOpen={() => onOpen(x.recipe)}
          >
            <span className="rpc-strip-text">
              <span className="rpc-strip-name">{x.recipe.title}</span>
              {captionTime(recipeTotalMinutes(x.recipe)) && <span className="rpc-strip-meta">{captionTime(recipeTotalMinutes(x.recipe))}</span>}
            </span>
          </RecipePhotoCard>
        ))}
      </div>
    </section>
  );
}

// The Similar view, in place of the card's content: Back, the yellow banner with one
// chip per ingredient (tap one to leave it out), the count and the photo cards of
// every recipe that shares its ingredients (the Recipes page's card). Tapping a
// card opens that recipe.
export function SimilarView({ recipe, chips, leftOut, onToggleChip, tiles, onOpen, onBack, onClose, phone }) {
  const off = new Set(leftOut);
  const banner = (
    <div className="riso-rc-sim-banner">
      <p className="riso-rc-sim-banner-title">{phone ? t("recipeCard.similarTitle") : t("recipeCard.similarAs", { title: recipe.title })}</p>
      {chips.length > 0 && (
        <div className="riso-rc-sim-chips">
          {chips.map((chip) => (
            <button key={chip.core} type="button" className={`riso-rc-sim-chip${off.has(chip.core) ? " off" : ""}`} aria-pressed={!off.has(chip.core)} onClick={() => onToggleChip(chip.core)}>
              {chip.name}
            </button>
          ))}
        </div>
      )}
      <span className="riso-rc-sim-note">{leftOut.length ? t("recipeCard.leftOut", { count: leftOut.length }) : t("recipeCard.tapToLeaveOut")}</span>
      {phone && (
        <button type="button" className="riso-rc-sim-back-phone" onClick={onBack}>
          {t("recipeCard.backToRecipe")}
        </button>
      )}
    </div>
  );
  return (
    <div className={`riso-rc-sim${phone ? " phone" : ""}`}>
      <div className="riso-rc-sim-top">
        {!phone && (
          <button type="button" className="riso-rc-sim-back" onClick={onBack}>
            <span className="riso-rc-sim-back-photo">{recipe.photoUrl ? <RecipePhoto src={recipe.photoUrl} alt="" /> : null}</span>
            {t("recipeCard.backToTitle", { title: recipe.title })}
          </button>
        )}
        <span className="riso-rc-spacer" />
        <button type="button" className="riso-rc-round" aria-label={t("recipeCard.close")} title={t("recipeCard.closeEsc")} onClick={onClose}>
          ×
        </button>
      </div>
      {!phone && <h2 className="riso-rc-sim-title">{t("finder.similar")}</h2>}
      {banner}
      <span className="riso-rc-caps">{t("recipeCard.shareCount", { count: tiles.length })}</span>
      <div className="riso-rc-sim-grid">
        {tiles.map((x) => {
          const caption = cardCaption(recipeSlotCaption(x.recipe), recipeTotalMinutes(x.recipe));
          return (
            <RecipePhotoCard
              key={x.recipe.id}
              variant="grid"
              className="riso-rc-sim-card"
              title={x.recipe.title}
              photoUrl={x.recipe.photoUrl}
              caption={<span className="rpc-cap-left">{caption}</span>}
              prepared={isPreparedRecipe(x.recipe)}
              openLabel={t("planner.open", { title: x.recipe.title })}
              onOpen={() => onOpen(x.recipe)}
            >
              <SharedSticker count={x.shared.length} />
            </RecipePhotoCard>
          );
        })}
      </div>
    </div>
  );
}
