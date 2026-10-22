import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EASE, T, play, whenDone } from "../lib/motion.js";
import { t } from "../i18n/index.js";

// The one toast of the whole app: a dark pill at the bottom of the screen that
// goes by itself after five seconds, with Undo when the change can be taken
// back. App.jsx keeps it (`showToast(message, undo?, options?)`) and passes `showToast`
// down as `onToast` / `actions.toast`, so Planner, Recipes, Inventory and the
// rest all use this one.
//
//   toast    { id, message, undo?, variant? } or null
//   message  a text, or { name, rest } for a grocery check: the item's name (bold, cut
//            with … when long) then its "· rest", which never wraps
//   variant  "store-dark" / "store-light": Store mode's own pill (lower, a bigger Undo)
//   onClose  hides it
//
// It never stacks: a message shown while another is up takes its place in the same
// pill (`replace: true` in showToast says so; the five seconds start again). It comes
// in with a short rise and fade the first time, swaps its text with a quick cross-fade
// after that, and leaves with a fade. Taps go through its body to the page under it; only
// Undo takes one. Design: docs/design/riso-v2-grocery-check-feedback/README.md §6.
export function Toast({ toast, onClose }) {
  const rootRef = useRef(null);
  const textRef = useRef(null);
  const lastRef = useRef(null); // the toast that is leaving keeps its look while it fades
  const showing = useRef(false);
  const shownId = useRef(null);
  const leaving = useRef(null); // the fade-out animation, so a new toast can stop it
  const [fading, setFading] = useState(false);

  if (toast) lastRef.current = toast;
  const drawn = toast || (fading ? lastRef.current : null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(onClose, T.toastLife); // real time, never slowed
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (toast) {
      leaving.current?.cancel();
      leaving.current = null;
      if (fading) setFading(false);
      if (!showing.current) {
        // First show: rises 8 px as it fades in.
        showing.current = true;
        play(
          root,
          [
            { opacity: 0, transform: "translate(-50%, 8px)" },
            { opacity: 1, transform: "translate(-50%, 0)" },
          ],
          { duration: T.toastIn }
        );
      } else if (shownId.current !== toast.id) {
        // Another message in the same pill: the text cross-fades, nothing re-enters.
        play(textRef.current, [{ opacity: 0 }, { opacity: 1 }], { duration: T.toastSwap, easing: EASE.linear });
      }
      shownId.current = toast.id;
    } else if (showing.current) {
      showing.current = false;
      shownId.current = null;
      const out = play(root, [{ opacity: 1 }, { opacity: 0 }], { duration: T.toastOut, fill: "forwards" });
      if (out) {
        setFading(true);
        leaving.current = out;
        whenDone(out, () => {
          if (leaving.current === out) {
            leaving.current = null;
            setFading(false);
          }
        });
      }
    }
  }, [toast?.id, !!toast]);

  if (!drawn) return null;
  const { message } = drawn;
  return (
    <div
      ref={rootRef}
      className={`riso-theme riso-toast${drawn.variant ? ` ${drawn.variant}` : ""}${toast ? "" : " leaving"}`}
      data-theme="light"
      role="status"
    >
      <span ref={textRef} className={`riso-toast-text${typeof message === "string" ? "" : " parts"}`}>
        {typeof message === "string" ? (
          message
        ) : (
          <>
            <span className="riso-toast-name">{message.name}</span>
            <span className="riso-toast-rest">{message.rest}</span>
          </>
        )}
      </span>
      {drawn.undo && (
        <button
          type="button"
          className="riso-toast-undo"
          disabled={!toast}
          onClick={() => {
            // Undo first, then close: a toast that leaves without Undo runs its
            // `onGone` (App.jsx showToast), which Undo has to come before.
            drawn.undo();
            onClose();
          }}
        >
          <span>{t("common.undo")}</span>
        </button>
      )}
    </div>
  );
}
