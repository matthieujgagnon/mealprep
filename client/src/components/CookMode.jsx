import { useEffect, useRef, useState } from "react";
import { stepText, stepImage } from "../lib/steps.js";

export function CookMode({ recipe, onExit }) {
  const steps = recipe.instructions || [];
  const [stepIndex, setStepIndex] = useState(0);
  const isLast = stepIndex === steps.length - 1;
  const wakeLockRef = useRef(null);

  // Keep the screen on for as long as cook mode is open — the whole point is
  // reading steps with the phone propped up on a counter; a screen timeout
  // mid-recipe is exactly the failure this is meant to prevent. Not every
  // browser supports the Wake Lock API, so this silently no-ops where it's
  // unavailable rather than breaking cook mode itself. Browsers also release
  // the lock automatically when the tab is backgrounded, so it's reacquired
  // on visibilitychange rather than assumed to still be held.
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
        // Permission denied, unsupported in this context, etc. — cook mode
        // still works fine, it just won't keep the screen awake.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        requestLock();
      }
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

  if (steps.length === 0) {
    return (
      <div className="cook-mode-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="cook-mode-card">
          <p>This recipe doesn't have any instruction steps to walk through.</p>
          <button className="btn primary" onClick={onExit}>
            Back to recipe
          </button>
        </div>
      </div>
    );
  }

  const currentStep = steps[stepIndex];
  const ownImage = stepImage(currentStep);
  // Fall back to the recipe's main photo when this specific step has no image
  // of its own, so cook mode never feels totally bare — but dim it slightly
  // to signal it's ambient context rather than a picture of this exact step.
  const displayImage = ownImage || recipe.photoUrl || recipe.photos?.[0] || null;

  return (
    // Stopping propagation here is what makes Back/Next/dots actually work —
    // without it, every click bubbles up to the recipe modal's overlay and
    // closes the whole thing instead of just advancing the step.
    <div className="cook-mode-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="cook-mode-card">
        <div className="cook-mode-header-top">
          <p className="cook-mode-recipe-title">{recipe.title}</p>
          <button className="modal-close" onClick={onExit} aria-label="Exit cook mode">
            ×
          </button>
        </div>
        <p className="cook-mode-progress">
          Step {stepIndex + 1} of {steps.length}
        </p>

        <div className="cook-mode-dots">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`cook-mode-dot${i === stepIndex ? " active" : ""}${i < stepIndex ? " done" : ""}`}
              onClick={() => setStepIndex(i)}
            />
          ))}
        </div>

        {displayImage && (
          <img
            src={displayImage}
            alt=""
            className={`cook-mode-step-image${ownImage ? "" : " ambient"}`}
          />
        )}

        <p className="cook-mode-step-text">{stepText(currentStep)}</p>

        <div className="cook-mode-nav">
          <button
            className="btn subtle"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          >
            ‹ Back
          </button>
          {isLast ? (
            <button className="btn primary" onClick={onExit}>
              Finish cooking
            </button>
          ) : (
            <button className="btn primary" onClick={() => setStepIndex((i) => i + 1)}>
              Next ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
