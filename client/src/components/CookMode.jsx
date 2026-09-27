import { useEffect, useRef, useState } from "react";
import { addDays, toDateKey } from "../lib/dates.js";
import { formatQuantity } from "../lib/units.js";
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
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function timerButtonLabel(t) {
  if (!t) return "Start timer";
  if (t.remaining <= 0) return "Reset";
  return t.running ? "Pause" : "Resume";
}

// A short beep on timer completion — synthesized rather than an audio file,
// since there's no reliable place to fetch a sound asset from and this
// avoids shipping one. Silently no-ops if the Web Audio API is unavailable
// or blocked; the timer card's own "done" state is the fallback signal.
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
    // Audio unavailable/blocked - not worth surfacing an error for.
  }
}

export function CookMode({ recipe, servings, onExit, onAddPantryItem }) {
  // Section-heading-only entries ("Make the sauce:") aren't real steps to
  // walk through one at a time — skip them, same as the numbered list in
  // the recipe card skips them from its own step count.
  const steps = (recipe.instructions || []).filter((s) => !stepIsHeading(s));
  const [stepIndex, setStepIndex] = useState(0);
  const [timers, setTimers] = useState({});
  const [finishOpen, setFinishOpen] = useState(false);
  const [portionsLeft, setPortionsLeft] = useState(Math.max(0, (servings || recipe.baseServings || 1) - 1));
  const [savingLeftovers, setSavingLeftovers] = useState(false);
  const wakeLockRef = useRef(null);
  const touchStartX = useRef(null);

  const isLast = stepIndex === steps.length - 1;
  const scale = (servings || recipe.baseServings || 1) / (recipe.baseServings || 1);

  // Keep the screen on for the whole cook mode session — the point is
  // reading steps with the phone propped up on a counter, and a screen
  // timeout mid-recipe is exactly the failure this prevents. Not every
  // browser supports the Wake Lock API, so this silently no-ops where it's
  // unavailable. Browsers also release the lock when the tab is
  // backgrounded, so it's reacquired on visibilitychange.
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let cancelled = false;

    async function requestLock() {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release();
          return;
        }
        wakeLockRef.current = lock;
      } catch {
        // Permission denied, unsupported in this context, etc.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !wakeLockRef.current) requestLock();
    }

    requestLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, []);

  // One interval for the whole session, ticking every running timer down
  // together — set up once rather than torn down and recreated every
  // second (which re-running this effect on every `timers` change would
  // do), and a no-op re-render when nothing is running.
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

  // Beep + notify exactly once per completed timer, then clear the flag
  // that triggered it.
  useEffect(() => {
    const finished = Object.entries(timers).filter(([, t]) => t.justFinished);
    if (finished.length === 0) return;
    playBeep();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("Timer done", { body: recipe.title });
      } catch {
        // Notification construction can throw in some contexts (e.g. service
        // worker required) - the beep already covers the signal.
      }
    }
    setTimers((prev) => {
      const next = { ...prev };
      for (const [key] of finished) next[key] = { ...next[key], justFinished: false };
      return next;
    });
  }, [timers, recipe.title]);

  const anyTimerRunning = Object.values(timers).some((t) => t.running);

  function goToStep(i) {
    setStepIndex(Math.max(0, Math.min(steps.length - 1, i)));
  }

  function handleExit() {
    if (anyTimerRunning && !window.confirm("A timer is still running. Exit cook mode anyway?")) return;
    onExit();
  }

  useEffect(() => {
    function handleKeyDown(e) {
      if (finishOpen) {
        if (e.key === "Escape") setFinishOpen(false);
        return;
      }
      if (e.key === "ArrowRight" && !isLast) goToStep(stepIndex + 1);
      else if (e.key === "ArrowLeft" && stepIndex > 0) goToStep(stepIndex - 1);
      else if (e.key === "Escape") handleExit();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, isLast, finishOpen, anyTimerRunning]);

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e) {
    if (touchStartX.current == null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 50) return;
    if (delta < 0 && !isLast) goToStep(stepIndex + 1);
    else if (delta > 0 && stepIndex > 0) goToStep(stepIndex - 1);
  }

  function handleTimerClick(spec) {
    setTimers((prev) => {
      const t = prev[stepIndex];
      if (!t || t.remaining <= 0) {
        return { ...prev, [stepIndex]: { remaining: spec.seconds, total: spec.seconds, running: true } };
      }
      return { ...prev, [stepIndex]: { ...t, running: !t.running } };
    });
  }

  async function handleSaveLeftovers() {
    if (portionsLeft <= 0) {
      onExit();
      return;
    }
    setSavingLeftovers(true);
    try {
      await onAddPantryItem?.({
        name: `${recipe.title} (leftovers)`,
        quantity: portionsLeft,
        unit: portionsLeft === 1 ? "portion" : "portions",
        location: "fridge",
        category: "Deli & Prepared Foods",
        expiresAt: recipe.fridgeLifeDays ? addDays(toDateKey(new Date()), recipe.fridgeLifeDays) : undefined,
      });
    } finally {
      setSavingLeftovers(false);
      onExit();
    }
  }

  if (steps.length === 0) {
    return (
      <div className="cm-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="cm-screen cm-empty">
          <p>This recipe doesn't have any instruction steps to walk through.</p>
          <button className="btn primary" onClick={onExit}>
            Back to recipe
          </button>
        </div>
      </div>
    );
  }

  const currentStep = steps[stepIndex];
  const title = stepTitle(currentStep);
  const bodyText = scale === 1 ? stepBody(currentStep) : scaleStepText(currentStep, scale);
  const image = stepImage(currentStep);
  const timerSpec = stepTimer(currentStep);
  const timerState = timers[stepIndex];
  const usedIngredients = stepIngredients(currentStep, recipe.ingredients || []);

  const prevTitle = stepIndex > 0 ? stepTitle(steps[stepIndex - 1]) : null;
  const nextTitle = !isLast ? stepTitle(steps[stepIndex + 1]) : null;

  const otherRunningTimers = Object.entries(timers).filter(([key, t]) => t.running && Number(key) !== stepIndex);

  return (
    <div
      className="cm-overlay"
      onClick={(e) => e.stopPropagation()}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="cm-screen">
        <div className="cm-topbar">
          <div className="cm-recipe-title">{recipe.title}</div>
          <div className="cm-progress-track">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`cm-progress-bar${i < stepIndex ? " done" : i === stepIndex ? " current" : ""}`}
              />
            ))}
          </div>
          <div className="cm-step-count">
            STEP {stepIndex + 1} OF {steps.length}
          </div>
          {otherRunningTimers.length > 0 && (
            <div className="cm-running-chip" title="Another step's timer is still running">
              ⏱ {otherRunningTimers.length}
            </div>
          )}
          <button type="button" className="cm-exit-btn" onClick={handleExit}>
            Exit
          </button>
        </div>

        <div className="cm-main">
          {image && (
            <div className="cm-photo-col">
              <img src={image} alt="" className="cm-photo" />
            </div>
          )}
          <div className={`cm-content-col${image ? "" : " full"}`}>
            {title && <div className="cm-step-title">{title}</div>}
            <p className="cm-step-text">{bodyText}</p>

            {timerSpec && (
              <div className="cm-timer-card">
                <div>
                  <div className="cm-timer-label">TIMER</div>
                  <div className="cm-timer-time">{formatClock(timerState ? timerState.remaining : timerSpec.seconds)}</div>
                </div>
                <button type="button" className="cm-timer-btn" onClick={() => handleTimerClick(timerSpec)}>
                  {timerButtonLabel(timerState)}
                </button>
              </div>
            )}

            {usedIngredients.length > 0 && (
              <div className="cm-uses">
                <div className="cm-uses-label">THIS STEP USES</div>
                <div className="cm-uses-pills">
                  {usedIngredients.map((ing) => {
                    const scaledQty = ing.quantity != null ? ing.quantity * scale : null;
                    return (
                      <span key={ing.id || ing.name} className="cm-uses-pill">
                        {ing.name}
                        {scaledQty != null && (
                          <span className="cm-uses-pill-qty">
                            {" "}
                            {formatQuantity(scaledQty)}
                            {ing.unit ? ` ${ing.unit}` : ""}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="cm-bottom-nav">
          <button type="button" className="cm-nav-btn" disabled={stepIndex === 0} onClick={() => goToStep(stepIndex - 1)}>
            ← {prevTitle || "Back"}
          </button>
          <span className="cm-nav-hint">Swipe or use ← → keys</span>
          {isLast ? (
            <button type="button" className="cm-nav-btn primary" onClick={() => setFinishOpen(true)}>
              Done
            </button>
          ) : (
            <button type="button" className="cm-nav-btn primary" onClick={() => goToStep(stepIndex + 1)}>
              Next{nextTitle ? `: ${nextTitle}` : ""} →
            </button>
          )}
        </div>
      </div>

      {finishOpen && (
        <div className="cm-finish-overlay" onClick={() => setFinishOpen(false)}>
          <div className="cm-finish-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>How many portions are left?</h3>
            <div className="cm-finish-stepper">
              <button type="button" onClick={() => setPortionsLeft((n) => Math.max(0, n - 1))} aria-label="Fewer portions">
                −
              </button>
              <span>{portionsLeft}</span>
              <button type="button" onClick={() => setPortionsLeft((n) => n + 1)} aria-label="More portions">
                +
              </button>
            </div>
            <div className="cm-finish-actions">
              <button type="button" className="btn subtle" onClick={onExit}>
                Skip
              </button>
              <button type="button" className="btn primary" onClick={handleSaveLeftovers} disabled={savingLeftovers}>
                {portionsLeft > 0 ? `Save ${portionsLeft} portion${portionsLeft === 1 ? "" : "s"}` : "Finish cooking"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
