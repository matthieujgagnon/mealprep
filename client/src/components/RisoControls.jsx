import { useEffect, useState } from "react";
import { isHintDismissed, dismissHint } from "../lib/hints.js";
import { api } from "../api.js";
import { Pill } from "./RisoPills.jsx";
import { LANGS, setLang, t, useLang } from "../i18n/index.js";

// 48x28 track switch - design_handoff_riso's shared "Switch" component.
// `tone="ink"`: the track is ink when on, not blue (blue means "you have it"); the Prepared meal
// switch is the one that uses it (design: docs/design/prepared-tag/).
export function Switch({ on, onToggle, label, tone }) {
  return (
    <button
      type="button"
      className={`riso-switch${tone ? ` tone-${tone}` : ""}${on ? " on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
    >
      <span className="riso-switch-knob" />
    </button>
  );
}

// "Include pantry and sides": the switch for the Makeable now rule, in the
// Riso chip style. `on` and `onChange` come from useIncludeSides(), so every
// page that shows it is showing the same setting.
export function IncludeSidesToggle({ on, onChange }) {
  return (
    <Pill size="chip" selected={on} onClick={() => onChange(!on)} className="includesides-toggle">
      {t("makeable.includeSides")}
    </Pill>
  );
}

// One outlined pill with a filled active segment - design_handoff_riso's
// shared "Segmented control" component. `options` is [{ id, label }].
// `className` adds a size ("inset": the 36px pill with 28px segments inside it,
// Inventory's Compact / Tiles); `ariaLabel` names the group, and each segment
// says whether it is the one chosen.
export function Segmented({ options, value, onChange, className = "", ariaLabel }) {
  return (
    <div className={`riso-segmented${className ? ` ${className}` : ""}`} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={value === opt.id ? "active" : ""}
          aria-pressed={value === opt.id}
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
// (an array of lines) draws it as a bulleted list instead. With `title`, the
// sticker, the title and Got it share the top line and `children` is a free
// body under them (Grocery's live demo).
export function HintStrip({ userId, screenKey, items, title, children }) {
  const [dismissed, setDismissed] = useState(() => isHintDismissed(userId, screenKey));
  if (dismissed) return null;
  const dismiss = (
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
  );
  if (title) {
    return (
      <div className="riso-hint-strip has-title">
        <div className="riso-hint-top">
          <span className="riso-sticker yellow riso-hint-sticker" style={{ position: "static" }}>
            {t("common.howItWorks")}
          </span>
          <p className="riso-hint-title">{title}</p>
          {dismiss}
        </div>
        {children}
      </div>
    );
  }
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
      {dismiss}
    </div>
  );
}

// A dropdown: label, value, ▾. Yellow when it isn't on its default option. On
// a phone it is a full-width pill that shows only the value (the label stays
// for screen readers). With variant="chip" it is one of a row of filter chips
// (Recipes: "Repas ▾", "Protéine ▾"): just the label and ▾, dark when set. Only
// one is open at a time (the page keeps `open`).
export function PillMenu({ id, label, value, options, selected, isDefault, open, phone, openLeft, variant, onToggle, onPick }) {
  return (
    <div className="rv2-menu-wrap">
      <button
        type="button"
        className={`rv2-drop${isDefault ? "" : " set"}${phone ? " phone" : ""}${variant === "chip" ? " chip" : ""}`}
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

// The one pop-up for a form: the bottom sheet on a phone, a centred panel with a
// round x on a computer (the Inventory item form and the Feedback form). Escape,
// the x and a tap on the dimmed page close it; `narrow` is the smaller panel.
//
//   label    what a screen reader calls it
//   isPhone  the caller's phone test (useIsPhone), so the form and the shell agree
//   onClose
export function Popup({ label, onClose, isPhone, narrow = false, children }) {
  // The phone sheet closes on Escape by itself.
  useEffect(() => {
    if (isPhone) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isPhone, onClose]);

  if (isPhone) {
    return (
      <BottomSheet label={label} onClose={onClose}>
        {children}
      </BottomSheet>
    );
  }
  return (
    <div className="riso-theme riso-popup-overlay" onClick={onClose}>
      <div className={`riso-popup${narrow ? " narrow" : ""}`} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="riso-popup-close" aria-label={t("common.close")} onClick={onClose}>
          ×
        </button>
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
