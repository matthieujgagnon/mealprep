import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// The one "are you sure?" question of the app, in the Riso v2 style instead of
// the browser's own dialog: a small centred pop-up with a question and two pill
// buttons, over a dimmed page. The safe answer comes first, is blue and has the
// focus; Escape, a tap on the dimmed area and that button all give it, so
// nothing is lost by mistake. It closes only itself: Escape never reaches the
// form or pop-up underneath.
//
//   message     the question
//   stayLabel   the safe answer (« Continuer à modifier » / "Keep editing")
//   leaveLabel  the other one (« Abandonner » / "Discard")
//   onStay, onLeave
export function ConfirmDialog({ message, stayLabel, leaveLabel, onStay, onLeave }) {
  const stayRef = useRef(null);
  const boxRef = useRef(null);
  const latest = useRef(onStay);
  latest.current = onStay;

  useEffect(() => {
    const previous = document.activeElement;
    stayRef.current?.focus();
    // Capture phase, so the form's own Escape listener never sees the key.
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        latest.current();
      } else if (e.key === "Tab") {
        const buttons = boxRef.current?.querySelectorAll("button");
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, []);

  // React events bubble through a portal to the components around it, so the
  // clicks are stopped here: the form underneath must not see them.
  return createPortal(
    <div
      className="riso-theme riso-ask-backdrop"
      data-theme="light"
      onClick={(e) => {
        e.stopPropagation();
        onStay();
      }}
    >
      <div ref={boxRef} className="riso-ask" role="alertdialog" aria-modal="true" aria-label={message} onClick={(e) => e.stopPropagation()}>
        <p className="riso-ask-message">{message}</p>
        <div className="riso-ask-actions">
          <button ref={stayRef} type="button" className="fnd-pop-btn primary" onClick={onStay}>
            {stayLabel}
          </button>
          <button type="button" className="fnd-pop-btn" onClick={onLeave}>
            {leaveLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
