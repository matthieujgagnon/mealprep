import { useEffect, useState } from "react";
import { isHintDismissed, dismissHint } from "../lib/hints.js";

// 48x28 track switch - design_handoff_riso's shared "Switch" component.
export function Switch({ on, onToggle, label }) {
  return (
    <button
      type="button"
      className={`riso-switch${on ? " on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
    >
      <span className="riso-switch-knob" />
    </button>
  );
}

// One outlined pill with a filled active segment - design_handoff_riso's
// shared "Segmented control" component. `options` is [{ id, label }].
export function Segmented({ options, value, onChange }) {
  return (
    <div className="riso-segmented">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={value === opt.id ? "active" : ""}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// The "how it works" dashed strip shown once per user per screen, per
// design_handoff_riso's shared component - `screenKey` scopes the
// dismissal (e.g. "home", "flyers"). `children` is the strip's copy.
export function HintStrip({ userId, screenKey, children }) {
  const [dismissed, setDismissed] = useState(() => isHintDismissed(userId, screenKey));
  if (dismissed) return null;
  return (
    <div className="riso-hint-strip">
      <span className="riso-sticker yellow riso-hint-sticker" style={{ position: "static" }}>
        how it works
      </span>
      <p className="riso-hint-text">{children}</p>
      <button
        type="button"
        className="riso-hint-dismiss"
        onClick={() => {
          dismissHint(userId, screenKey);
          setDismissed(true);
        }}
      >
        Got it
      </button>
    </div>
  );
}

// Phone bottom sheet (Riso Mobile.dc.html): card-white, 2px top border,
// 28px top corners, a drag handle, over a 45% ink backdrop that closes it.
export function BottomSheet({ onClose, label, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);
  return (
    <div className="riso-theme riso-sheet-backdrop" onClick={onClose}>
      <div className="riso-sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <span className="riso-sheet-handle" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
