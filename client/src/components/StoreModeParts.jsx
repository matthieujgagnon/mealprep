import { useMemo, useRef, useState } from "react";
import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { colorOfStore, parseColor, textOn } from "../lib/storeColors.js";
import { makeBurst, makeConfetti } from "../lib/storeConfetti.js";
import { t } from "../i18n/index.js";

// The small pieces of Store mode (design: docs/design/riso-v2-store-mode): the
// store's sticker, the draggable row and the places it is dropped, the three
// sheets that rise from the bottom (leave, added, store colours) and the confetti. StoreMode.jsx puts them together.

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

// A tap on the dimmed backdrop closes it, but only a tap that started there: the
// finger that opened a sheet (a long press) lifts over the backdrop, and that must
// not close it again.
function Sheet({ label, onClose, children }) {
  const pressedHere = useRef(false);
  return (
    <div
      className="store-mode-backdrop"
      onPointerDown={() => {
        pressedHere.current = true;
      }}
      onClick={() => pressedHere.current && onClose()}
    >
      <div className="store-mode-sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// A row of the list that is picked up by a press and hold (the app's one drag
// setup, in `App.jsx`) and dropped on another store. A tap still checks it (the
// row's own button); `flash` rings it for a moment after it was moved, so it is
// easy to find in its new store. Only the listeners go on the row, not dnd-kit's
// button role: the row already holds a button.
export function DraggableRow({ itemKey, flash, drag, children }) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `store-row-${itemKey}`,
    data: { storeDrag: drag },
    disabled: !drag,
  });
  return (
    <div
      ref={setNodeRef}
      className={`store-mode-move${drag ? " draggable" : ""}${flash ? " moved" : ""}${isDragging ? " lifted" : ""}`}
      data-move-key={itemKey}
      onContextMenu={(e) => e.preventDefault()}
      {...listeners}
    >
      {children}
    </div>
  );
}

// Something an item can be dropped on: a store's whole section (sticker header
// included) or, in the tray, a store with nothing on screen. It lights up while
// a dragged item is over it, and never for the store the item is already in.
export function StoreDropZone({ store, className = "", children, ...rest }) {
  const { active } = useDndContext();
  const drag = active?.data.current?.storeDrag;
  const here = !!drag && drag.from === store;
  const { setNodeRef, isOver } = useDroppable({
    id: `store-drop:${store}`,
    data: { storeDrop: store },
    disabled: !drag || here,
  });
  return (
    <section ref={setNodeRef} className={`${className}${drag && !here ? " drop-ready" : ""}${isOver ? " drop-over" : ""}`} {...rest}>
      {children}
    </section>
  );
}

// While an item is carried: a row of the stores that are not on screen (no items
// today, or all done and hidden), so every store can be dropped on.
export function DropTray({ stores, colors, dark, storeLabel }) {
  const { active } = useDndContext();
  if (!active?.data.current?.storeDrag || stores.length === 0) return null;
  return (
    <div className="store-mode-tray" role="group" aria-label={t("storeMode.trayAria")}>
      <span className="store-mode-tray-label">{t("storeMode.trayLabel")}</span>
      <div className="store-mode-tray-stores">
        {stores.map((store) => (
          <StoreDropZone key={store} store={store} className="store-mode-tray-drop" data-store-drop={store}>
            <StoreSticker name={storeLabel(store)} color={colorOfStore(colors, store)} dark={dark} />
          </StoreDropZone>
        ))}
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
// Store mode's celebration, or with `burst` the finished view's (lib/storeConfetti.js).
export function StoreConfetti({ burst = false }) {
  const { pieces, sparkles } = useMemo(() => (burst ? makeBurst() : makeConfetti()), [burst]);
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
            animation: `${p.anim} ${p.duration} ${p.delay} ${burst ? "cubic-bezier(.15,.7,.35,1)" : "ease-out"} forwards`,
            ...p.vars,
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
