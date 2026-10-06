import { useMemo, useState } from "react";
import { colorOfStore, parseColor, textOn } from "../lib/storeColors.js";
import { makeConfetti } from "../lib/storeConfetti.js";
import { t } from "../i18n/index.js";

// The small pieces of Store mode (design: docs/design/riso-v2-store-mode): the
// store's sticker, the three sheets that rise from the bottom (leave, added,
// store colours) and the confetti. StoreMode.jsx puts them together.

const EXAMPLE_COLOUR = "#FF48B0"; // the example in the colour box

// The store's name on its colour, tilted. Dark Store mode: light text on black,
// with the colour as the shadow. Light: the colour itself, with ink or white
// text (whichever reads better) and an ink border and shadow.
export function StoreSticker({ name, color, dark, className = "" }) {
  const style = dark
    ? { background: "#000000", color: "#F4F1EA", borderColor: "transparent", boxShadow: `2px 2px 0 ${color}` }
    : { background: color, color: textOn(color), borderColor: "#16181F", boxShadow: "2px 2px 0 #16181F" };
  return (
    <span className={`store-mode-sticker ${className}`} style={style}>
      {name}
    </span>
  );
}

function Sheet({ label, onClose, children }) {
  return (
    <div className="store-mode-backdrop" onClick={onClose}>
      <div className="store-mode-sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// "← List" with items checked: add them to Inventory (which opens the Inventory
// confirmation first), leave without adding, or keep shopping.
export function LeaveSheet({ count, busy, onAdd, onLeave, onKeep }) {
  return (
    <Sheet label={t("storeMode.leaveTitle", { count })} onClose={onKeep}>
      <h2 className="store-mode-sheet-title">{t("storeMode.leaveTitle", { count })}</h2>
      <p className="store-mode-sheet-body">{t("storeMode.leaveBody")}</p>
      <button type="button" className="store-mode-sheet-primary" disabled={busy} onClick={onAdd}>
        {t("storeMode.leaveAdd")}
      </button>
      <button type="button" className="store-mode-sheet-second" onClick={onLeave}>
        {t("storeMode.leaveWithout")}
      </button>
      <button type="button" className="store-mode-sheet-link" onClick={onKeep}>
        {t("storeMode.keepShopping")}
      </button>
    </Sheet>
  );
}

// After they were added: the items are off the list.
export function AddedSheet({ count, onBack }) {
  return (
    <Sheet label={t("storeMode.addedTitle")} onClose={onBack}>
      <h2 className="store-mode-sheet-title">{t("storeMode.addedTitle")}</h2>
      <p className="store-mode-sheet-body">{t("storeMode.addedBody", { count })}</p>
      <button type="button" className="store-mode-sheet-primary" onClick={onBack}>
        {t("storeMode.backToList")}
      </button>
    </Sheet>
  );
}

// One row per store: its sticker, the colour wheel and a box to type a colour
// (#RGB, #RRGGBB, r, g, b or rgb(r, g, b)); every valid change is saved at once.
export function ColoursSheet({ stores, colors, dark, storeLabel, onColor, onReset, onClose }) {
  const [drafts, setDrafts] = useState({});
  return (
    <Sheet label={t("storeMode.coloursTitle")} onClose={onClose}>
      <h2 className="store-mode-sheet-title">{t("storeMode.coloursTitle")}</h2>
      <p className="store-mode-sheet-body">{t("storeMode.coloursHint")}</p>
      {stores.map((name) => {
        const color = colorOfStore(colors, name);
        const text = drafts[name] ?? color;
        const valid = parseColor(text) != null;
        return (
          <div key={name} className="store-mode-colour-row">
            <div className="store-mode-colour-name">
              <StoreSticker name={storeLabel(name)} color={color} dark={dark} />
            </div>
            <input
              type="color"
              className="store-mode-colour-wheel"
              value={color.toLowerCase()}
              title={t("storeMode.wheel")}
              aria-label={t("storeMode.wheelOf", { store: storeLabel(name) })}
              onChange={(e) => {
                setDrafts((d) => ({ ...d, [name]: undefined }));
                onColor(name, e.target.value.toUpperCase());
              }}
            />
            <input
              type="text"
              className={`store-mode-colour-text${valid ? "" : " bad"}`}
              value={text}
              placeholder={EXAMPLE_COLOUR}
              autoComplete="off"
              spellCheck="false"
              aria-label={t("storeMode.colourOf", { store: storeLabel(name) })}
              aria-invalid={!valid}
              onChange={(e) => {
                const value = e.target.value;
                setDrafts((d) => ({ ...d, [name]: value }));
                const parsed = parseColor(value);
                if (parsed) onColor(name, parsed);
              }}
            />
          </div>
        );
      })}
      <div className="store-mode-sheet-row">
        <button
          type="button"
          className="store-mode-sheet-second"
          onClick={() => {
            setDrafts({});
            onReset();
          }}
        >
          {t("storeMode.reset")}
        </button>
        <button type="button" className="store-mode-sheet-primary" onClick={onClose}>
          {t("storeMode.coloursDone")}
        </button>
      </div>
    </Sheet>
  );
}

// Over the whole screen, never in the way of a tap. Made fresh each time it starts.
export function StoreConfetti() {
  const { pieces, sparkles } = useMemo(() => makeConfetti(), []);
  return (
    <div className="store-mode-confetti" aria-hidden="true" data-testid="store-confetti">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            top: p.top,
            bottom: p.bottom,
            left: p.left,
            right: p.right,
            width: p.w,
            height: p.h,
            background: p.bg,
            borderRadius: p.radius,
            animation: `${p.anim} ${p.duration} ${p.delay} ease-out forwards`,
          }}
        />
      ))}
      {sparkles.map((s, i) => (
        <span
          key={i}
          className="store-mode-sparkle"
          style={{ left: s.left, top: s.top, width: s.size, height: s.size, background: s.color, animationDelay: s.delay }}
        />
      ))}
    </div>
  );
}
