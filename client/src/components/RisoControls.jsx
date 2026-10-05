import { useEffect, useState } from "react";
import { isHintDismissed, dismissHint } from "../lib/hints.js";
import { api } from "../api.js";
import { LANGS, setLang, t, useLang } from "../i18n/index.js";

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
// dismissal (e.g. "home", "flyers"). `children` is the strip's copy; `items`
// (an array of lines) draws it as a bulleted list instead.
export function HintStrip({ userId, screenKey, items, children }) {
  const [dismissed, setDismissed] = useState(() => isHintDismissed(userId, screenKey));
  if (dismissed) return null;
  return (
    <div className={`riso-hint-strip${items ? " has-list" : ""}`}>
      <span className="riso-sticker yellow riso-hint-sticker" style={{ position: "static" }}>
        {t("common.howItWorks")}
      </span>
      {items ? (
        <ul className="riso-hint-list">
          {items.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="riso-hint-text">{children}</p>
      )}
      <button
        type="button"
        className="riso-hint-dismiss"
        onClick={() => {
          dismissHint(userId, screenKey);
          setDismissed(true);
        }}
      >
        {t("common.gotIt")}
      </button>
    </div>
  );
}

// A dropdown: label, value, ▾. Yellow when it isn't on its default option. On
// a phone it is a full-width pill that shows only the value (the label stays
// for screen readers). Only one is open at a time (the page keeps `open`).
export function PillMenu({ id, label, value, options, selected, isDefault, open, phone, openLeft, onToggle, onPick }) {
  return (
    <div className="rv2-menu-wrap">
      <button
        type="button"
        className={`rv2-drop${isDefault ? "" : " set"}${phone ? " phone" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => onToggle(id)}
      >
        <span className="rv2-drop-label">{label}</span>
        <span className="rv2-drop-value">{value}</span>
        <span className="rv2-drop-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={`rv2-menu${openLeft ? " left" : ""}`} role="listbox" aria-label={label}>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === selected}
              className={`rv2-menu-item${o.id === selected ? " selected" : ""}`}
              onClick={() => onPick(o.id)}
            >
              {o.label}
              {o.id === selected && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
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

// FR | EN, each written in its own language. Signed in, the choice is
// saved to the account so it follows you to other devices (and the app's
// emails come in it too).
export function LanguageSwitch({ persist = true }) {
  const lang = useLang();
  return (
    <div className="riso-lang-switch" role="group" aria-label={t("lang.label")}>
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          lang={code === "fr" ? "fr-CA" : "en-CA"}
          className={lang === code ? "active" : ""}
          aria-pressed={lang === code}
          aria-label={t(code === "fr" ? "same.langFr" : "same.langEn")}
          title={t(code === "fr" ? "same.langFr" : "same.langEn")}
          onClick={() => {
            setLang(code);
            if (persist) api.saveLocale(code).catch(() => {});
          }}
        >
          {t(code === "fr" ? "same.fr" : "same.en")}
        </button>
      ))}
    </div>
  );
}
