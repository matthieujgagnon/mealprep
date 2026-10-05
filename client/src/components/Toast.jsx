import { useEffect } from "react";
import { t } from "../i18n/index.js";

// The one toast of the whole app: a dark pill at the bottom of the screen that
// goes by itself after five seconds, with Undo when the change can be taken
// back. App.jsx keeps it (`showToast(message, undo?)`) and passes `showToast`
// down as `onToast` / `actions.toast`, so Planner, Recipes, Inventory and the
// rest all use this one.
//
//   toast    { id, message, undo? } or null
//   onClose  hides it
export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id]);

  if (!toast) return null;
  return (
    <div className="riso-theme riso-toast" data-theme="light" role="status">
      <span>{toast.message}</span>
      {toast.undo && (
        <button
          type="button"
          className="riso-toast-undo"
          onClick={() => {
            const undo = toast.undo;
            onClose();
            undo();
          }}
        >
          {t("common.undo")}
        </button>
      )}
    </div>
  );
}
