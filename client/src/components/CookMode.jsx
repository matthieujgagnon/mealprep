import { useState } from "react";
import { stepText, stepImage } from "../lib/steps.js";

export function CookMode({ recipe, onExit }) {
  const steps = recipe.instructions || [];
  const [stepIndex, setStepIndex] = useState(0);
  const isLast = stepIndex === steps.length - 1;

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
