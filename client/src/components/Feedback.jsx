import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { t } from "../i18n/index.js";
import { useIsPhone } from "../hooks/useIsPhone.js";
import { DEFAULT_KIND, ERROR_KIND, FEEDBACK_KINDS, FEEDBACK_MAX_LENGTH, canSend, feedbackContext, showCounter } from "../lib/feedback.js";
import { ConfirmDialog } from "./ConfirmDialog.jsx";
import { Popup } from "./RisoControls.jsx";

// The Feedback form (design: Matt's plan in the Feedback pull request; shared
// pieces: Popup, ConfirmDialog, the chips and buttons). It is one form for every
// way in: the avatar menu's "Send feedback", the button at the end of Help, a
// "Report a problem" link beside an error message, and the crash screen.
//
// App.jsx keeps it open or closed and provides FeedbackContext, whose value opens
// it: openFeedback({ kind?, errorName? }). A place that wants to offer it reads
// `useFeedback()` (null when there is no form to open, so it shows nothing).
//
// The tester writes a message and picks a kind. The app adds, without asking, what
// lib/feedback.js `feedbackContext` lists, and nothing else. A failed send keeps
// the text and says so. Closing with something typed asks first.

export const FeedbackContext = createContext(null);
export const useFeedback = () => useContext(FeedbackContext);

// "Report a problem": a small link beside an error message that opens the form with
// "Something's wrong" chosen. `errorName` is a fixed label for the message the
// person saw ("LoadError"), never its text. Nothing when there is no form to open.
export function ReportProblemLink({ errorName, className = "riso-report-link" }) {
  const open = useFeedback();
  if (!open) return null;
  return (
    <button type="button" className={className} onClick={() => open({ kind: ERROR_KIND, errorName })}>
      {t("feedback.reportProblem")}
    </button>
  );
}

// preset  { kind?, errorName? } from the place that opened it
// page    the page the person is on ("planner"), sent with the message
// onSent  called once the server has saved it (the caller closes the form and says thanks)
// onClose called when the person leaves without sending
export function FeedbackForm({ preset = {}, page, onSent, onClose }) {
  const isPhone = useIsPhone();
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState(preset.kind || DEFAULT_KIND);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  function requestClose() {
    if (busy) return;
    if (message.trim()) setAsking(true);
    else onClose();
  }

  // Escape closes this form and only this one: the page or pop-up under it (the
  // Inventory item form, the recipe form) keeps its own state. It is taken in the
  // capture phase, as ConfirmDialog does, and left to the question while that is up.
  const escape = useRef({});
  escape.current = { asking, requestClose };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || escape.current.asking) return;
      e.preventDefault();
      e.stopPropagation();
      escape.current.requestClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!canSend(message, busy)) return;
    setBusy(true);
    setError(null);
    try {
      await api.sendFeedback({ message, kind, ...feedbackContext({ page, errorName: preset.errorName }) });
      onSent();
    } catch (err) {
      // The server's own words (in the reader's language) for "too long" and "you've
      // sent a lot"; anything else, including no connection, is the general message.
      setError(err.status === 400 || err.status === 429 ? err.message : t("feedback.sendFailed"));
      setBusy(false);
    }
  }

  return createPortal(
    <div className="riso-theme riso-feedback-layer" data-theme="light">
      <Popup label={t("feedback.menu")} onClose={requestClose} isPhone={isPhone} narrow>
        <form className="riso-feedback" onSubmit={submit} noValidate>
          <header className="riso-feedback-head">
            <h2 className="riso-feedback-title">
              {t("feedback.titleStart")} <span className="accent">{t("feedback.titleAccent")}</span>
            </h2>
            <p className="riso-feedback-intro">{t("feedback.intro")}</p>
          </header>

          <fieldset className="riso-feedback-kinds">
            <legend className="riso-feedback-label">{t("feedback.kindLabel")}</legend>
            <div className="riso-chip-row">
              {FEEDBACK_KINDS.map((k) => (
                <button key={k} type="button" className={`riso-chip${kind === k ? " active" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {t(`feedback.kinds.${k}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="riso-feedback-field">
            <label className="riso-feedback-label" htmlFor="feedback-message">
              {t("feedback.messageLabel")}
            </label>
            <textarea
              id="feedback-message"
              ref={boxRef}
              rows={isPhone ? 5 : 6}
              maxLength={FEEDBACK_MAX_LENGTH}
              value={message}
              placeholder={t("feedback.placeholder")}
              onChange={(e) => setMessage(e.target.value)}
            />
            {showCounter(message) && (
              <span className="riso-feedback-count" aria-live="polite">
                {t("feedback.counter", { count: message.length, max: FEEDBACK_MAX_LENGTH })}
              </span>
            )}
          </div>

          <p className="riso-feedback-attached">{t("feedback.attached")}</p>

          {error && (
            <p className="riso-feedback-error" role="alert">
              {error}
            </p>
          )}

          <div className="riso-feedback-actions">
            <button type="button" className="riso-btn" onClick={requestClose}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="riso-btn primary" disabled={!canSend(message, busy)}>
              {busy ? t("feedback.sending") : t("feedback.send")}
            </button>
          </div>
        </form>
      </Popup>
      {asking && (
        <ConfirmDialog
          message={t("feedback.discardAsk")}
          stayLabel={t("feedback.keepWriting")}
          leaveLabel={t("feedback.discard")}
          onStay={() => setAsking(false)}
          onLeave={onClose}
        />
      )}
    </div>,
    document.body
  );
}
