import { useState } from "react";
import { clockParts, formatClock, secondsFromParts } from "../lib/steps.js";
import { t } from "../i18n/index.js";

// A step's timer on the recipe card. Tap the time to change it (minutes and
// seconds); Start, Pause, Resume and Reset do what they say. The state is the
// recipe's shared `stepTimers` (see useStepTimers), the same one Cook mode uses,
// so the two always agree.
export function StepTimer({ timerKey, seconds, stepTimers }) {
  const timer = stepTimers.stateFor(timerKey, seconds);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState({ minutes: "", seconds: "" });

  function startEditing() {
    const { minutes, seconds: secs } = clockParts(timer.total);
    setFields({ minutes: String(minutes), seconds: String(secs) });
    setEditing(true);
  }

  function save(e) {
    e.preventDefault();
    const total = secondsFromParts(fields.minutes, fields.seconds);
    if (total > 0) stepTimers.setDuration(timerKey, total);
    setEditing(false);
  }

  if (editing) {
    return (
      <form
        className="riso-rc-timer editing"
        onSubmit={save}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation(); // closes this, not the recipe card
            setEditing(false);
          }
        }}
      >
        <label className="riso-rc-timer-field">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="5940"
            autoFocus
            aria-label={t("steps.minutesField")}
            value={fields.minutes}
            onChange={(e) => setFields((f) => ({ ...f, minutes: e.target.value }))}
          />
          <span aria-hidden="true">{t("steps.minAbbr")}</span>
        </label>
        <label className="riso-rc-timer-field">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="59"
            aria-label={t("steps.secondsField")}
            value={fields.seconds}
            onChange={(e) => setFields((f) => ({ ...f, seconds: e.target.value }))}
          />
          <span aria-hidden="true">{t("steps.secAbbr")}</span>
        </label>
        <button type="submit" className="riso-rc-timer-btn primary">
          {t("common.save")}
        </button>
        <button type="button" className="riso-rc-timer-btn" onClick={() => setEditing(false)}>
          {t("common.cancel")}
        </button>
      </form>
    );
  }

  const clock = formatClock(timer.remaining);
  const main = timer.running
    ? t("steps.pause")
    : timer.finished
      ? t("steps.startAgain")
      : timer.paused
        ? t("steps.resume")
        : t("steps.start");

  return (
    <div className={`riso-rc-timer${timer.running ? " running" : ""}${timer.finished ? " done" : ""}`}>
      <button
        type="button"
        className="riso-rc-timer-time"
        aria-label={t("steps.editTime", { time: formatClock(timer.total) })}
        title={t("steps.editTimeTitle")}
        onClick={startEditing}
      >
        <span aria-hidden="true">⏱</span> {timer.finished ? t("steps.timerDone") : clock}
      </button>
      <button type="button" className="riso-rc-timer-btn primary" onClick={() => stepTimers.toggle(timerKey, seconds)}>
        {main}
      </button>
      {(timer.running || timer.finished || timer.changed) && (
        <button type="button" className="riso-rc-timer-btn" onClick={() => stepTimers.reset(timerKey)}>
          {t("steps.reset")}
        </button>
      )}
    </div>
  );
}
