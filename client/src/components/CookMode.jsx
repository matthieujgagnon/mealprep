import { useEffect, useRef, useState } from "react";
import { formatQuantity } from "../lib/units.js";
import { core } from "../lib/similarRecipes.js";
import {
  stepBody,
  stepImage,
  stepIngredients,
  stepIsHeading,
  stepTimer,
  stepTitle,
  scaleStepText,
} from "../lib/steps.js";

function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatTotalTime(minutes) {
  if (!minutes) return null;
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h} H${m ? ` ${m} MIN` : ""}`;
  }
  return `${minutes} MIN`;
}

// "ROASTING…" for a roast step, per the design; a plain "RUNNING…" when the
// step doesn't say what's happening.
const TIMER_VERBS = [
  ["roast", "ROASTING"],
  ["bake", "BAKING"],
  ["simmer", "SIMMERING"],
  ["boil", "BOILING"],
  ["fry", "FRYING"],
  ["grill", "GRILLING"],
  ["rest", "RESTING"],
  ["chill", "CHILLING"],
  ["marinate", "MARINATING"],
  ["rise", "RISING"],
  ["steam", "STEAMING"],
  ["cook", "COOKING"],
];
function runningLabel(text) {
  const t = (text || "").toLowerCase();
  const hit = TIMER_VERBS.find(([w]) => new RegExp(`\\b${w}`).test(t));
  return `${hit ? hit[1] : "RUNNING"}…`;
}

// USDA FoodKeeper guidance for cooked leftovers.
const LEFTOVER_STORAGE = [
  { id: "fridge", label: "Fridge", range: "3–4 DAYS", days: 4 },
  { id: "freezer", label: "Freezer", range: "2–3 MONTHS", days: 75 },
];

// A short beep on timer completion - synthesized so there's no audio asset
// to ship. Silently no-ops if Web Audio is unavailable or blocked.
function playBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close();
  } catch {
    // Audio unavailable - the TIME'S UP label is the fallback signal.
  }
}

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
  onAddPantryItem,
  pantryInventory = [],
  onConsumePantryItems,
  onPlanLeftovers,
  startStep = 1,
}) {
  // Section headings ("Make the sauce:") aren't steps to walk through.
  const steps = (recipe.instructions || []).filter((s) => !stepIsHeading(s));
  const [stepIndex, setStepIndex] = useState(Math.min(Math.max(startStep - 1, 0), Math.max(steps.length - 1, 0)));
  const [finished, setFinished] = useState(false);
  const [timers, setTimers] = useState({}); // stepIndex -> { remaining, total, running, justFinished }
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

  // One interval ticks every running timer, so a step's timer keeps going
  // after you move to another step.
  useEffect(() => {
    const id = setInterval(() => {
      setTimers((prev) => {
        let changed = false;
        const next = {};
        for (const [key, t] of Object.entries(prev)) {
          if (t.running && t.remaining > 0) {
            changed = true;
            const remaining = t.remaining - 1;
            next[key] = remaining <= 0 ? { ...t, remaining: 0, running: false, justFinished: true } : { ...t, remaining };
          } else {
            next[key] = t;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const done = Object.entries(timers).filter(([, t]) => t.justFinished);
    if (done.length === 0) return;
    playBeep();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("Time's up", { body: recipe.title });
      } catch {
        // Some contexts need a service worker; the beep already fired.
      }
    }
    setTimers((prev) => {
      const next = { ...prev };
      for (const [key] of done) next[key] = { ...next[key], justFinished: false };
      return next;
    });
  }, [timers, recipe.title]);

  const anyTimerRunning = Object.values(timers).some((t) => t.running);
  const currentStep = steps[stepIndex];
  const timerSpec = currentStep ? stepTimer(currentStep) : null;
  const timer = timers[stepIndex];

  function goToStep(i) {
    setFinished(false);
    setStepIndex(Math.max(0, Math.min(steps.length - 1, i)));
  }

  function next() {
    if (isLast) setFinished(true);
    else goToStep(stepIndex + 1);
  }

  function handleExit() {
    if (anyTimerRunning && !window.confirm("A timer is still running. Exit cook mode anyway?")) return;
    onExit();
  }

  function toggleTimer() {
    if (!timerSpec) return;
    // Ask once, on the first timer start, so "time's up" can notify.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    setTimers((prev) => {
      const t = prev[stepIndex];
      if (!t || t.remaining <= 0) {
        return { ...prev, [stepIndex]: { remaining: timerSpec.seconds, total: timerSpec.seconds, running: true } };
      }
      return { ...prev, [stepIndex]: { ...t, running: !t.running } };
    });
  }

  function addMinute() {
    setTimers((prev) => {
      const t = prev[stepIndex] || { remaining: timerSpec.seconds, total: timerSpec.seconds, running: false };
      return { ...prev, [stepIndex]: { ...t, remaining: t.remaining + 60 } };
    });
  }

  function resetTimer() {
    setTimers((prev) => {
      const nextTimers = { ...prev };
      delete nextTimers[stepIndex];
      return nextTimers;
    });
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
      await onAddPantryItem?.({
        name: `${recipe.title} (leftovers)`,
        quantity: portions,
        unit: portions === 1 ? "portion" : "portions",
        location: storage,
        category: "Deli & Prepared Foods",
        expiresAt: new Date(
          Date.now() + (storage === "fridge" ? recipe.fridgeLifeDays || option.days : option.days) * 86400000
        ).toISOString(),
      });
      if (storage === "fridge") await onPlanLeftovers?.(recipe, portions);
      setSavedTo(option.label);
    } finally {
      setSaving(false);
    }
  }

  const totalTime = formatTotalTime((recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0));
  const meta = ["COOK MODE", `SERVES ${serves}`, totalTime].filter(Boolean).join(" · ");
  const otherRunning = Object.entries(timers).filter(([key, t]) => t.running && Number(key) !== stepIndex);

  const header = (
    <header className="cm-topbar">
      <button type="button" className="cm-back" onClick={handleExit}>
        ← Recipe
      </button>
      <div className="cm-title-block">
        <div className="cm-recipe-title">{recipe.title}</div>
        <div className="cm-meta">{meta}</div>
      </div>
      {steps.length > 0 && (
        <div className="cm-segments" role="tablist" aria-label="Steps">
          {steps.map((s, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={!finished && i === stepIndex}
              aria-label={`Step ${i + 1}${stepTitle(s) ? `: ${stepTitle(s)}` : ""}`}
              title={`Step ${i + 1}`}
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
          title="Another step's timer is running - go to it"
          onClick={() => goToStep(Number(otherRunning[0][0]))}
        >
          ⏱ {formatClock(otherRunning[0][1].remaining)}
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
        Keep screen on
      </button>
      <button type="button" className="cm-exit" aria-label="Exit cook mode" title="Exit cook mode" onClick={handleExit}>
        ×
      </button>
    </header>
  );

  if (steps.length === 0) {
    return (
      <div className="cm-overlay riso-theme" onClick={(e) => e.stopPropagation()}>
        {header}
        <main className="cm-empty">
          <p>This recipe doesn't have any steps to walk through yet.</p>
          <button type="button" className="cm-btn primary" onClick={onExit}>
            Back to recipe
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
            <span className="cm-done-sticker">all done!</span>
            <h2 className="cm-done-title">
              Dinner's <span className="accent">ready.</span>
            </h2>
            <p className="cm-done-copy">
              Marking it as cooked takes the ingredients you used out of your Inventory, so Makeable and the
              grocery list stay accurate.
            </p>
            <div className="cm-done-actions">
              <button type="button" className={`cm-btn${cooked ? "" : " primary"}`} onClick={markCooked} disabled={cooked}>
                {cooked ? "✓ Removed from Inventory" : "Mark as cooked"}
              </button>
              <button type="button" className="cm-btn" onClick={() => goToStep(0)}>
                Back to step 1
              </button>
            </div>
          </div>

          <section className="cm-leftovers" aria-label="Save leftovers">
            <h3 className="cm-leftovers-title">Save leftovers?</h3>
            <div className="cm-leftovers-row">
              <span className="cm-leftovers-label">Portions left</span>
              <div className="cm-stepper">
                <button type="button" aria-label="Fewer portions" onClick={() => { setPortions((n) => Math.max(0, n - 1)); setSavedTo(null); }}>
                  −
                </button>
                <span aria-live="polite">{portions}</span>
                <button type="button" aria-label="More portions" onClick={() => { setPortions((n) => n + 1); setSavedTo(null); }}>
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
                ? "Nothing left over."
                : storage === "fridge"
                ? `${portions} portion${portions === 1 ? "" : "s"} go${portions === 1 ? "es" : ""} to your Fridge and show${portions === 1 ? "s" : ""} up as "leftover" in the Planner.`
                : `${portions} portion${portions === 1 ? "" : "s"} go${portions === 1 ? "es" : ""} to your Freezer.`}
            </p>
            <button
              type="button"
              className={`cm-btn wide${savedTo ? "" : " primary"}`}
              onClick={saveLeftovers}
              disabled={saving || portions === 0 || !!savedTo}
            >
              {savedTo ? `✓ Saved to ${savedTo}` : "Save leftovers"}
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
  const remaining = timer ? timer.remaining : timerSpec?.seconds;
  const timerLabel = timer && timer.remaining === 0 ? "TIME'S UP" : timer?.running ? runningLabel(`${title} ${text}`) : "TIMER";
  const timerButton = timer?.running
    ? "Pause"
    : timer && timer.remaining === 0
    ? "▶ Start again"
    : timer && timer.remaining < timer.total
    ? "Resume"
    : "▶ Start timer";

  return (
    <div className="cm-overlay riso-theme" onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {header}
      <main className="cm-main">
        <div className="cm-left">
          <div className="cm-step-head">
            <span className="cm-step-num">{stepIndex + 1}</span>
            <div>
              <div className="cm-step-count">
                STEP {stepIndex + 1} OF {steps.length}
              </div>
              {title && <div className="cm-step-title">{title}</div>}
            </div>
          </div>
          <p className="cm-step-text">{text}</p>

          {used.length > 0 && (
            <div className="cm-uses">
              <div className="cm-uses-head">
                <span className="cm-uses-label">FOR THIS STEP</span>
                <span className="cm-uses-hint">Tap to check off as you add them.</span>
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
                          {ing.unit ? ` ${ing.unit}` : ""}
                        </span>
                      )}
                      <span className="cm-uses-name">{ing.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {timerSpec && (
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
                  +1 min
                </button>
                <button type="button" className="cm-timer-btn" onClick={resetTimer}>
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="cm-right">
          <div className="cm-photo">{image && <img src={image} alt="" />}</div>
          {nextStep && (
            <button type="button" className="cm-up-next" onClick={next}>
              <span className="cm-up-next-label">
                UP NEXT · STEP {stepIndex + 2}
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
            ← Previous
          </button>
          <span className="cm-bottom-count">
            STEP {stepIndex + 1} OF {steps.length}
          </span>
          <button type="button" className={`cm-next${isLast ? " finish" : ""}`} onClick={next}>
            {isLast ? "Finish ✓" : "Next step →"}
          </button>
        </div>
      </footer>
    </div>
  );
}
