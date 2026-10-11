import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { useTheme } from "../hooks/useTheme.js";
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
import { stepParagraphText } from "../lib/stepParagraphs.js";
import { buildPrep } from "../lib/cookPrep.js";
import { RecipePhoto } from "./RecipePhoto.jsx";
import { DoFirstCard, PrepList, StepIngredients, StepRail, TimerCard } from "./CookModeParts.jsx";
import { ThemeSwitch } from "./ThemeSwitch.jsx";
import { t } from "../i18n/index.js";

// Cook mode (design: docs/design/riso-v2-cook-mode/): one step at a time, full
// screen. On a computer three columns (the step rail, the step, the photo and timer);
// on a phone one column under a row of step dots. A recipe whose ingredients have prep
// notes ("diced") opens on a "Before you start" page first (design:
// docs/design/riso-v2-cook-mode-prep/, page -1 below, dot 0 on the rail); a recipe with
// none opens on step 1. The last step's "I cooked this" opens the finished view
// (components/CookedView.jsx, which App.jsx shows over Cook mode).

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
  onFinish,
  stepTimers,
  startStep = 1,
}) {
  // Section headings ("Make the sauce:") aren't steps to walk through.
  const steps = (recipe.instructions || []).filter((s) => !stepIsHeading(s));
  // What the "Before you start" page lists, from the recipe's own ingredient notes. No
  // rows means no page: Cook mode opens on step 1. Page -1 is that page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prep = useMemo(() => buildPrep(recipe.ingredients || [], steps), [recipe]);
  const hasPrep = steps.length > 0 && prep.rows.length > 0;
  const firstPage = hasPrep ? -1 : 0;
  const [stepIndex, setStepIndex] = useState(() =>
    hasPrep && startStep <= 1 ? -1 : Math.min(Math.max(startStep - 1, 0), Math.max(steps.length - 1, 0))
  );
  // True while the finished view (App's, over this) is open after "I cooked this".
  const [finished, setFinished] = useState(false);
  const [checked, setChecked] = useState({}); // `${stepIndex}:${name}` -> true (`prep:${name}` for one no step uses)
  const [keepAwake, setKeepAwake] = useState(true);
  const { theme, dark, toggle: toggleTheme } = useTheme();
  const serves = servings || recipe.baseServings || 1;
  const touchStartX = useRef(null);

  useWakeLock(keepAwake);

  const isLast = stepIndex === steps.length - 1;
  const scale = serves / (recipe.baseServings || 1);

  // The timers are the recipe card's too (they're kept by the step's place in
  // the whole recipe, headings counted), so a time edited there shows here and
  // a timer started there keeps running here.
  const stepKeys = (recipe.instructions || []).flatMap((s, i) => (stepIsHeading(s) ? [] : [i]));
  const timerKey = stepKeys[stepIndex];
  const currentStep = steps[stepIndex];
  const timerSpec = currentStep ? stepTimer(currentStep) : null;
  const timer = timerSpec ? stepTimers.stateFor(timerKey, timerSpec.seconds) : null;

  function goToStep(i) {
    setFinished(false);
    setStepIndex(Math.max(firstPage, Math.min(steps.length - 1, i)));
  }

  // The prep page shares its ticks with "For this step": a row is ticked in every step
  // that uses the ingredient, and shows ticked once all of them are. An ingredient no
  // step uses has a tick of its own on this page. Nothing here touches Inventory.
  const prepKeys = (row) =>
    row.stepNumbers.length ? row.stepNumbers.map((n) => `${n - 1}:${row.ingredient.name}`) : [`prep:${row.ingredient.name}`];
  const prepRowOn = (row) => prepKeys(row).every((key) => checked[key]);
  function togglePrepRow(row) {
    const keys = prepKeys(row);
    const turnOn = !keys.every((key) => checked[key]);
    setChecked((prev) => {
      const next = { ...prev };
      for (const key of keys) next[key] = turnOn;
      return next;
    });
  }

  // The last step's "I cooked this" opens the finished view. "Back to step 1"
  // there comes back here; × and "Back to the app" close Cook mode too.
  function next() {
    if (!isLast) {
      goToStep(stepIndex + 1);
      return;
    }
    setFinished(true);
    onFinish?.(serves, { onBackToStep1: () => goToStep(0) });
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

  // × and Escape close at once and ask nothing: the timers belong to the recipe card
  // (it keeps them), so closing never loses one. A running timer carries on there.
  useEffect(() => {
    function onKey(e) {
      if (e.target.closest?.("input, textarea")) return;
      if (e.key === "ArrowRight" && !finished) next();
      else if (e.key === "ArrowLeft" && !finished && stepIndex > firstPage) goToStep(stepIndex - 1);
      else if (e.key === " " && !finished && timerSpec) {
        e.preventDefault();
        toggleTimer();
      } else if (e.key === "Escape") onExit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, finished, timerSpec, isLast]);

  // Everything for the step - its text, what to check off, and on a phone the timer -
  // fits on the screen without scrolling: the step text starts at the design's size
  // and steps down a pixel at a time until the column fits. If it still doesn't, the
  // rows and the timer tighten up (compact, then tight), and only then does the
  // column scroll.
  const isPhone = useIsPhone();
  const leftRef = useRef(null);
  useLayoutEffect(() => {
    const el = leftRef.current;
    if (!el) return;
    function fit() {
      const phone = window.innerWidth < 768;
      const overflows = () => el.scrollHeight > el.clientHeight;
      for (const stage of [0, 1, 2]) {
        el.classList.toggle("compact", stage >= 1);
        el.classList.toggle("tight", stage >= 2);
        let size = phone ? 19 : 34;
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
    // A swipe along the phone's row of dots scrolls the dots; it doesn't change step.
    touchStartX.current = e.target.closest?.(".cm-phone-steps") ? null : e.touches[0].clientX;
  }
  function onTouchEnd(e) {
    if (touchStartX.current == null || finished) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 50) return;
    if (delta < 0) next();
    else if (stepIndex > firstPage) goToStep(stepIndex - 1);
  }

  const totalTime = formatTotalTime((recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0));
  const meta = [t("cookMode.meta"), t("cookMode.serves", { count: serves }), totalTime].filter(Boolean).join(" · ");
  const otherRunning = stepTimers.running.filter((r) => r.key !== timerKey && stepKeys.includes(r.key));

  // One top bar for every view: the title, the other-step timer when one is running,
  // the light / dark switch, Keep screen on (a computer only: on a phone the screen
  // stays awake) and ×.
  const header = (
    <header className="cm-topbar">
      <div className="cm-title-block">
        <div className="cm-recipe-title">{recipe.title}</div>
        <div className="cm-meta">{meta}</div>
      </div>
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
      <ThemeSwitch dark={dark} onToggle={toggleTheme} className="cm-theme" />
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
        onClick={onExit}
      >
        ×
      </button>
    </header>
  );

  if (steps.length === 0) {
    return (
      <div className="cm-overlay riso-theme" data-theme={theme} onClick={(e) => e.stopPropagation()}>
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

  if (stepIndex < 0) {
    // "Before you start": the rail (with its dot 0), the list, and the photo with Do first
    // beside it. On a phone there is no photo and Do first comes before the list.
    const firstStep = steps[0];
    const firstTitle = stepTitle(firstStep);
    const photo = recipe.photoUrl;
    const doFirst = prep.doFirst ? <DoFirstCard text={prep.doFirst} /> : null;
    const rail = (variant) => (
      <StepRail steps={steps} stepIndex={stepIndex} variant={variant} onGo={goToStep} prepLabel={t("cookMode.prep.rail")} />
    );
    return (
      <div className="cm-overlay riso-theme cm-step-view cm-prep-view" data-theme={theme} onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {header}
        {isPhone && (
          <div className="cm-phone-steps">
            {rail("top")}
            <div className="cm-step-title">{t("cookMode.prep.title")}</div>
          </div>
        )}
        <main className="cm-main">
          {!isPhone && rail("side")}

          <div className="cm-left cm-prep-col">
            <div className="cm-prep-intro">
              <div className="cm-step-count">{t("cookMode.prep.eyebrow", { count: prep.rows.length })}</div>
              {!isPhone && <h3 className="cm-step-title">{t("cookMode.prep.title")}</h3>}
              <p className="cm-prep-sub">{t("cookMode.prep.sub")}</p>
            </div>
            {isPhone && doFirst}
            <PrepList groups={prep.groups} scale={scale} phone={isPhone} isOn={prepRowOn} onToggle={togglePrepRow} />
          </div>

          {!isPhone && (
            <aside className="cm-right">
              <div className={`cm-photo${photo ? "" : " empty"}`}>{photo && <RecipePhoto src={photo} alt="" />}</div>
              {doFirst}
            </aside>
          )}
        </main>

        <footer className="cm-bottom">
          {!isPhone && (
            <button type="button" className="cm-up-next" onClick={next}>
              <span className="cm-up-next-label">
                {firstTitle ? t("cookMode.prep.then", { title: firstTitle.toUpperCase() }) : t("cookMode.prep.thenNoTitle")}
              </span>
              <span className="cm-up-next-text">{stepBody(firstStep)}</span>
            </button>
          )}
          <button type="button" className="cm-next" onClick={next}>
            {t("cookMode.prep.start")}
          </button>
        </footer>
      </div>
    );
  }

  const title = stepTitle(currentStep);
  const text = scale === 1 ? stepBody(currentStep) : scaleStepText(currentStep, scale);
  const image = stepImage(currentStep) || recipe.photoUrl;
  const used = stepIngredients(currentStep, recipe.ingredients || []);
  const nextStep = !isLast ? steps[stepIndex + 1] : null;
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
  const stepOf = t("cookMode.stepOf", { n: stepIndex + 1, total: steps.length });

  // On a phone the timer sits under the step; on a computer it moves to the photo
  // column, so the step and its ingredients get the room.
  const timerBlock = timerSpec ? (
    <TimerCard
      label={timerLabel}
      time={formatClock(timer?.remaining)}
      mainLabel={timerButton}
      onMain={toggleTimer}
      onPlusMinute={addMinute}
      onReset={resetTimer}
    />
  ) : null;

  return (
    <div className="cm-overlay riso-theme cm-step-view" data-theme={theme} onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {header}
      {isPhone && (
        <div className="cm-phone-steps">
          <StepRail steps={steps} stepIndex={stepIndex} variant="top" onGo={goToStep} prepLabel={hasPrep ? t("cookMode.prep.rail") : undefined} />
          {title && <div className="cm-step-title">{title}</div>}
        </div>
      )}
      <main className="cm-main">
        {!isPhone && <StepRail steps={steps} stepIndex={stepIndex} variant="side" onGo={goToStep} prepLabel={hasPrep ? t("cookMode.prep.rail") : undefined} />}

        <div className="cm-left" ref={leftRef}>
          {isPhone && image && (
            <div className="cm-photo strip">
              <RecipePhoto src={image} alt="" />
            </div>
          )}
          <div className="cm-step-count">{stepOf}</div>
          {!isPhone && title && <h3 className="cm-step-title">{title}</h3>}
          <p className="cm-step-text">{stepParagraphText(text)}</p>

          {used.length > 0 && (
            <StepIngredients
              items={used}
              stepIndex={stepIndex}
              scale={scale}
              checked={checked}
              onToggle={(key) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }))}
            />
          )}

          {isPhone && timerBlock}
        </div>

        {!isPhone && (
          <aside className="cm-right">
            <div className={`cm-photo${image ? "" : " empty"}`}>{image && <RecipePhoto src={image} alt="" />}</div>
            {timerBlock}
          </aside>
        )}
      </main>

      <footer className="cm-bottom">
        <button type="button" className="cm-prev" aria-label={t("cookMode.previous")} disabled={stepIndex === firstPage} onClick={() => goToStep(stepIndex - 1)}>
          {isPhone ? "←" : t("cookMode.previous")}
        </button>
        {!isPhone &&
          (nextStep ? (
            <button type="button" className="cm-up-next" onClick={next}>
              <span className="cm-up-next-label">
                {t("cookMode.upNext", { n: stepIndex + 2 })}
                {stepTitle(nextStep) ? ` · ${stepTitle(nextStep).toUpperCase()}` : ""}
              </span>
              <span className="cm-up-next-text">{stepBody(nextStep)}</span>
            </button>
          ) : (
            <span className="cm-bottom-spacer" />
          ))}
        <button type="button" className={`cm-next${isLast ? " finish" : ""}`} onClick={next}>
          {isLast ? t("cooked.button") : t("cookMode.nextStep")}
        </button>
      </footer>
    </div>
  );
}
