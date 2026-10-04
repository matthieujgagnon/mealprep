import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatQuantity, unitLabel } from "../lib/units.js";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { core } from "../lib/similarRecipes.js";
import {
  stepBody,
  stepImage,
  stepIngredients,
  stepIsHeading,
  stepTimer,
  stepTitle,
  scaleStepText,
  formatClock,
} from "../lib/steps.js";
import { t } from "../i18n/index.js";

function formatTotalTime(minutes) {
  if (!minutes) return null;
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? t("cookMode.hoursMinutes", { h, m }) : t("cookMode.hours", { h });
  }
  return t("cookMode.minutes", { m: minutes });
}

// "ROASTING…" for a roast step, per the design; a plain "RUNNING…" when the
// step doesn't say what's happening. Reads English and French steps.
const TIMER_VERBS = [
  ["roast", /\broast|\brôti|\broti/],
  ["bake", /\bbake|\bau four|\benfourn/],
  ["simmer", /\bsimmer|\bmijot/],
  ["boil", /\bboil|\bbouill/],
  ["fry", /\bfry|\bfrire|\bfrit/],
  ["grill", /\bgrill/],
  ["rest", /\brest\b|\brest[^a]|\brepos/],
  ["chill", /\bchill|\bréfrig|\brefroid/],
  ["marinate", /\bmarinat|\bmariner/],
  ["rise", /\brise|\blever|\blève/],
  ["steam", /\bsteam|\bvapeur/],
  ["cook", /\bcook|\bcuire|\bcuisson/],
];
function runningLabel(text) {
  const lower = (text || "").toLowerCase();
  const hit = TIMER_VERBS.find(([, re]) => re.test(lower));
  return `${t(`cookMode.verbs.${hit ? hit[0] : "running"}`)}…`;
}

// USDA FoodKeeper guidance for cooked leftovers.
const LEFTOVER_STORAGE = [
  {
    id: "fridge",
    days: 4,
    get label() {
      return t("cookMode.fridge");
    },
    get range() {
      return t("cookMode.fridgeRange");
    },
  },
  {
    id: "freezer",
    days: 75,
    get label() {
      return t("cookMode.freezer");
    },
    get range() {
      return t("cookMode.freezerRange");
    },
  },
];

function useWakeLock(enabled) {
  const lockRef = useRef(null);
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return undefined;
    let cancelled = false;
    async function request() {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) lock.release();
        else lockRef.current = lock;
      } catch {
        // Denied or unsupported here.
      }
    }
    // Browsers drop the lock when the tab is hidden; take it back on return.
    function onVisible() {
      if (document.visibilityState === "visible") request();
    }
    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lockRef.current?.release();
      lockRef.current = null;
    };
  }, [enabled]);
}

export function CookMode({
  recipe,
  servings,
  onExit,
  onRequestInventoryAdd,
  pantryInventory = [],
  onConsumePantryItems,
  onPlanLeftovers,
  stepTimers,
  startStep = 1,
}) {
  // Section headings ("Make the sauce:") aren't steps to walk through.
  const steps = (recipe.instructions || []).filter((s) => !stepIsHeading(s));
  const [stepIndex, setStepIndex] = useState(Math.min(Math.max(startStep - 1, 0), Math.max(steps.length - 1, 0)));
  const [finished, setFinished] = useState(false);
  const [checked, setChecked] = useState({}); // `${stepIndex}:${name}` -> true
  const [keepAwake, setKeepAwake] = useState(true);
  const [cooked, setCooked] = useState(false);
  const serves = servings || recipe.baseServings || 1;
  const [portions, setPortions] = useState(Math.max(0, serves - 1));
  const [storage, setStorage] = useState("fridge");
  const [savedTo, setSavedTo] = useState(null);
  const [saving, setSaving] = useState(false);
  const touchStartX = useRef(null);

  useWakeLock(keepAwake);

  const isLast = stepIndex === steps.length - 1;
  const scale = serves / (recipe.baseServings || 1);

  // The timers are the recipe card's too (they're kept by the step's place in
  // the whole recipe, headings counted), so a time edited there shows here and
  // a timer started there keeps running here.
  const stepKeys = (recipe.instructions || []).flatMap((s, i) => (stepIsHeading(s) ? [] : [i]));
  const timerKey = stepKeys[stepIndex];
  const anyTimerRunning = stepTimers.anyRunning;
  const currentStep = steps[stepIndex];
  const timerSpec = currentStep ? stepTimer(currentStep) : null;
  const timer = timerSpec ? stepTimers.stateFor(timerKey, timerSpec.seconds) : null;

  function goToStep(i) {
    setFinished(false);
    setStepIndex(Math.max(0, Math.min(steps.length - 1, i)));
  }

  function next() {
    if (isLast) setFinished(true);
    else goToStep(stepIndex + 1);
  }

  function handleExit() {
    if (anyTimerRunning && !window.confirm(t("cookMode.confirmExit"))) return;
    onExit();
  }

  function toggleTimer() {
    if (timerSpec) stepTimers.toggle(timerKey, timerSpec.seconds);
  }

  function addMinute() {
    if (timerSpec) stepTimers.addSeconds(timerKey, timerSpec.seconds, 60);
  }

  function resetTimer() {
    stepTimers.reset(timerKey);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.target.closest?.("input, textarea")) return;
      if (e.key === "ArrowRight" && !finished) next();
      else if (e.key === "ArrowLeft" && !finished && stepIndex > 0) goToStep(stepIndex - 1);
      else if (e.key === " " && !finished && timerSpec) {
        e.preventDefault();
        toggleTimer();
      } else if (e.key === "Escape") handleExit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, finished, timerSpec, anyTimerRunning, isLast]);

  // Everything for the step - its text, what to check off, the timer -
  // fits on the screen without scrolling: the step text starts at its full
  // size and steps down a pixel at a time until the column fits (the timer
  // scales with it). Only a very long step at the smallest size scrolls.
  const isPhone = useIsPhone();
  const leftRef = useRef(null);
  useLayoutEffect(() => {
    const el = leftRef.current;
    if (!el) return;
    function fit() {
      const phone = window.innerWidth < 768;
      const overlay = el.closest(".cm-overlay");
      const overflows = () => el.scrollHeight > el.clientHeight;
      // Tighter and tighter: smaller text; then compact pills and timer;
      // then (on a phone) the photo makes way.
      const stages = phone ? [[false, false], [true, false], [true, true]] : [[false, false], [true, false]];
      for (const [compact, noPhoto] of stages) {
        el.classList.toggle("compact", compact);
        overlay?.classList.toggle("cm-no-photo", noPhoto);
        let size = phone ? 24 : 36;
        const min = phone ? 14 : 16;
        el.style.setProperty("--cm-step-size", `${size}px`);
        while (size > min && overflows()) {
          size -= 1;
          el.style.setProperty("--cm-step-size", `${size}px`);
        }
        if (!overflows()) return;
      }
    }
    fit();
    document.fonts?.ready.then(fit);
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [stepIndex, finished, scale, steps.length, isPhone]);

  function onTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e) {
    if (touchStartX.current == null || finished) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 50) return;
    if (delta < 0) next();
    else if (stepIndex > 0) goToStep(stepIndex - 1);
  }

  // Everything in Inventory that one of this recipe's ingredients uses up.
  const usedInventoryIds = (() => {
    const cores = new Set((recipe.ingredients || []).map((i) => core(i.name)).filter(Boolean));
    return pantryInventory.filter((item) => cores.has(core(item.name))).map((item) => item.id);
  })();

  async function markCooked() {
    if (cooked) return;
    if (usedInventoryIds.length > 0) await onConsumePantryItems?.(usedInventoryIds, "consumed");
    setCooked(true);
  }

  async function saveLeftovers() {
    if (portions <= 0 || savedTo) return;
    const option = LEFTOVER_STORAGE.find((o) => o.id === storage);
    setSaving(true);
    try {
      // Opens the Inventory confirmation: nothing is saved (or planned)
      // unless it's confirmed.
      const added = await onRequestInventoryAdd?.(
        [
          {
            ref: "leftovers",
            name: t("cookMode.leftoversName", { title: recipe.title }),
            quantity: portions,
            unit: "portion",
            location: storage,
            category: "Deli & Prepared Foods",
            expiresAt: new Date(
              Date.now() + (storage === "fridge" ? recipe.fridgeLifeDays || option.days : option.days) * 86400000
            ).toISOString(),
          },
        ],
        { title: t("inventoryConfirm.leftoversTitle") }
      );
      if (!added?.length) return;
      if (storage === "fridge") await onPlanLeftovers?.(recipe, portions);
      setSavedTo(option.label);
    } finally {
      setSaving(false);
    }
  }

  const totalTime = formatTotalTime((recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0));
  const meta = [t("cookMode.meta"), t("cookMode.serves", { count: serves }), totalTime].filter(Boolean).join(" · ");
  const otherRunning = stepTimers.running.filter((r) => r.key !== timerKey && stepKeys.includes(r.key));

  const header = (
    <header className="cm-topbar">
      <button type="button" className="cm-back" onClick={handleExit}>
        {t("cookMode.back")}
      </button>
      <div className="cm-title-block">
        <div className="cm-recipe-title">{recipe.title}</div>
        <div className="cm-meta">{meta}</div>
      </div>
      {steps.length > 0 && (
        <div className="cm-segments" role="tablist" aria-label={t("cookMode.steps")}>
          {steps.map((s, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={!finished && i === stepIndex}
              aria-label={
                stepTitle(s) ? t("cookMode.stepLabelTitle", { n: i + 1, title: stepTitle(s) }) : t("cookMode.stepLabel", { n: i + 1 })
              }
              title={t("cookMode.stepLabel", { n: i + 1 })}
              className={`cm-segment${finished || i < stepIndex ? " done" : i === stepIndex ? " current" : ""}`}
              onClick={() => goToStep(i)}
            />
          ))}
        </div>
      )}
      {otherRunning.length > 0 && (
        <button
          type="button"
          className="cm-running-chip"
          title={t("cookMode.otherRunning")}
          onClick={() => goToStep(stepKeys.indexOf(otherRunning[0].key))}
        >
          ⏱ {formatClock(otherRunning[0].remaining)}
        </button>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={keepAwake}
        className={`cm-awake${keepAwake ? " on" : ""}`}
        onClick={() => setKeepAwake((v) => !v)}
      >
        <span className="cm-awake-track">
          <span />
        </span>
        {t("cookMode.keepAwake")}
      </button>
      <button
        type="button"
        className="cm-exit"
        aria-label={t("cookMode.exit")}
        title={t("cookMode.exit")}
        onClick={handleExit}
      >
        ×
      </button>
    </header>
  );

  if (steps.length === 0) {
    return (
      <div className="cm-overlay riso-theme" onClick={(e) => e.stopPropagation()}>
        {header}
        <main className="cm-empty">
          <p>{t("cookMode.noSteps")}</p>
          <button type="button" className="cm-btn primary" onClick={onExit}>
            {t("cookMode.backToRecipe")}
          </button>
        </main>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="cm-overlay riso-theme" onClick={(e) => e.stopPropagation()}>
        {header}
        <main className="cm-done">
          <div className="cm-done-left">
            <span className="cm-done-sticker">{t("cookMode.allDone")}</span>
            <h2 className="cm-done-title">
              {t("cookMode.readyStart")} <span className="accent">{t("cookMode.readyAccent")}</span>
            </h2>
            <p className="cm-done-copy">{t("cookMode.doneCopy")}</p>
            <div className="cm-done-actions">
              <button type="button" className={`cm-btn${cooked ? "" : " primary"}`} onClick={markCooked} disabled={cooked}>
                {cooked ? t("cookMode.removed") : t("cookMode.markCooked")}
              </button>
              <button type="button" className="cm-btn" onClick={() => goToStep(0)}>
                {t("cookMode.backToStep1")}
              </button>
            </div>
          </div>

          <section className="cm-leftovers" aria-label={t("cookMode.saveLeftoversLabel")}>
            <h3 className="cm-leftovers-title">{t("cookMode.saveLeftoversQ")}</h3>
            <div className="cm-leftovers-row">
              <span className="cm-leftovers-label">{t("cookMode.portionsLeft")}</span>
              <div className="cm-stepper">
                <button type="button" aria-label={t("cookMode.fewer")} onClick={() => { setPortions((n) => Math.max(0, n - 1)); setSavedTo(null); }}>
                  −
                </button>
                <span aria-live="polite">{portions}</span>
                <button type="button" aria-label={t("cookMode.more")} onClick={() => { setPortions((n) => n + 1); setSavedTo(null); }}>
                  +
                </button>
              </div>
            </div>
            <div className="cm-storage">
              {LEFTOVER_STORAGE.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={storage === o.id}
                  className={`cm-storage-option${storage === o.id ? " on" : ""}`}
                  onClick={() => {
                    setStorage(o.id);
                    setSavedTo(null);
                  }}
                >
                  <span>{o.label}</span>
                  <span className="cm-storage-range">{o.range}</span>
                </button>
              ))}
            </div>
            <p className="cm-leftovers-line">
              {portions === 0
                ? t("cookMode.nothingLeft")
                : storage === "fridge"
                ? t("cookMode.toFridge", { count: portions })
                : t("cookMode.toFreezer", { count: portions })}
            </p>
            <button
              type="button"
              className={`cm-btn wide${savedTo ? "" : " primary"}`}
              onClick={saveLeftovers}
              disabled={saving || portions === 0 || !!savedTo}
            >
              {savedTo ? t("cookMode.savedTo", { place: savedTo }) : t("cookMode.saveLeftovers")}
            </button>
          </section>
        </main>
      </div>
    );
  }

  const title = stepTitle(currentStep);
  const text = scale === 1 ? stepBody(currentStep) : scaleStepText(currentStep, scale);
  const image = stepImage(currentStep) || recipe.photoUrl;
  const used = stepIngredients(currentStep, recipe.ingredients || []);
  const nextStep = !isLast ? steps[stepIndex + 1] : null;
  const remaining = timer?.remaining;
  const timerLabel = timer?.finished
    ? t("cookMode.timeUpLabel")
    : timer?.running
    ? runningLabel(`${title} ${text}`)
    : t("cookMode.timer");
  const timerButton = timer?.running
    ? t("cookMode.pause")
    : timer?.finished
    ? t("cookMode.startAgain")
    : timer?.paused
    ? t("cookMode.resume")
    : t("cookMode.startTimer");

  // On a phone the timer sits under the step; on a wider screen it moves to
  // the photo column so the step and its ingredients get the room.
  const timerBlock = timerSpec ? (
    <div className="cm-timer">
      <div className="cm-timer-readout">
        <span className="cm-timer-label">{timerLabel}</span>
        <span className="cm-timer-time">{formatClock(remaining)}</span>
      </div>
      <div className="cm-timer-actions">
        <button type="button" className="cm-timer-main" onClick={toggleTimer}>
          {timerButton}
        </button>
        <button type="button" className="cm-timer-btn" onClick={addMinute}>
          {t("cookMode.plusMinute")}
        </button>
        <button type="button" className="cm-timer-btn" onClick={resetTimer}>
          {t("cookMode.reset")}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="cm-overlay riso-theme cm-step-view" onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {header}
      <main className="cm-main">
        <div className="cm-left" ref={leftRef}>
          <div className="cm-step-head">
            <span className="cm-step-num">{stepIndex + 1}</span>
            <div>
              <div className="cm-step-count">{t("cookMode.stepOf", { n: stepIndex + 1, total: steps.length })}</div>
              {title && <div className="cm-step-title">{title}</div>}
            </div>
          </div>
          <p className="cm-step-text">{text}</p>

          {used.length > 0 && (
            <div className="cm-uses">
              <div className="cm-uses-head">
                <span className="cm-uses-label">{t("cookMode.forThisStep")}</span>
                <span className="cm-uses-hint">{t("cookMode.tapToCheck")}</span>
              </div>
              <div className="cm-uses-pills">
                {used.map((ing) => {
                  const key = `${stepIndex}:${ing.name}`;
                  const on = !!checked[key];
                  const qty = ing.quantity != null ? ing.quantity * scale : null;
                  return (
                    <button
                      key={ing.id || ing.name}
                      type="button"
                      aria-pressed={on}
                      className={`cm-uses-pill${on ? " on" : ""}`}
                      onClick={() => setChecked((prev) => ({ ...prev, [key]: !prev[key] }))}
                    >
                      <span className="cm-uses-dot">{on ? "✓" : ""}</span>
                      {qty != null && (
                        <span className="cm-uses-qty">
                          {formatQuantity(qty)}
                          {ing.unit ? ` ${unitLabel(ing.unit, qty)}` : ""}
                        </span>
                      )}
                      <span className="cm-uses-name">{ing.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isPhone && timerBlock}
        </div>

        <aside className="cm-right">
          {!isPhone && timerBlock}
          <div className={`cm-photo${image ? "" : " empty"}`}>{image && <img src={image} alt="" />}</div>
          {nextStep && (
            <button type="button" className="cm-up-next" onClick={next}>
              <span className="cm-up-next-label">
                {t("cookMode.upNext", { n: stepIndex + 2 })}
                {stepTitle(nextStep) ? ` · ${stepTitle(nextStep).toUpperCase()}` : ""}
              </span>
              <span className="cm-up-next-text">{stepBody(nextStep)}</span>
            </button>
          )}
        </aside>
      </main>

      <footer className="cm-bottom">
        <div className="cm-bottom-inner">
          <button type="button" className="cm-prev" disabled={stepIndex === 0} onClick={() => goToStep(stepIndex - 1)}>
            {t("cookMode.previous")}
          </button>
          <span className="cm-bottom-count">{t("cookMode.stepOf", { n: stepIndex + 1, total: steps.length })}</span>
          <button type="button" className={`cm-next${isLast ? " finish" : ""}`} onClick={next}>
            {isLast ? t("cookMode.finish") : t("cookMode.nextStep")}
          </button>
        </div>
      </footer>
    </div>
  );
}
