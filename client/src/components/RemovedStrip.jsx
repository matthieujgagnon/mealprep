import { useId } from "react";

// The one "removed" strip: a quiet dashed card under a list with what was taken
// off it and a way to put each thing back. Grocery's "Removed from your list"
// and Inventory's "Recently removed" are both this strip.
//
//  - `items`: [{ key, name, onPutBack, ariaLabel, meta?, putBackLabel? }]. An
//    entry without `meta` is a struck-through chip with ↺ (Grocery); with `meta`
//    ("Used up · yesterday") it is a row with its own Put back button (Inventory).
//  - `onClear` / `clearLabel`: the "Clear" link at the end (Grocery).
//  - `collapsible`: the label is a button that opens and closes the strip
//    (`open`, `onToggle`), with the count beside it (Inventory, closed to begin with).
//  - `className`: an extra class for the page around it.
export function RemovedStrip({ label, items, onClear, clearLabel, collapsible = false, open = true, onToggle, className = "" }) {
  const bodyId = useId();
  if (!items.length) return null;
  const shown = !collapsible || open;
  const rows = items.some((it) => it.meta);
  return (
    <div className={`riso-removed${collapsible ? " collapsible" : ""}${shown ? " open" : ""}${className ? ` ${className}` : ""}`}>
      {collapsible ? (
        <button type="button" className="riso-removed-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <span className="riso-removed-label">{label}</span>
          <span className="riso-removed-count">{items.length}</span>
          <span className="riso-removed-caret" aria-hidden="true">
            {open ? "▴" : "▾"}
          </span>
        </button>
      ) : (
        <span className="riso-removed-label">{label}</span>
      )}
      {shown &&
        (rows ? (
          <ul className="riso-removed-rows" id={bodyId}>
            {items.map((it) => (
              <li key={it.key} className="riso-removed-row">
                <span className="riso-removed-name">{it.name}</span>
                <span className="riso-removed-meta">{it.meta}</span>
                <button type="button" className="riso-removed-putback" aria-label={it.ariaLabel} onClick={it.onPutBack}>
                  {it.putBackLabel} <span aria-hidden="true">↺</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          items.map((it) => (
            <button key={it.key} type="button" className="riso-removed-chip" aria-label={it.ariaLabel} onClick={it.onPutBack}>
              {it.name} <span aria-hidden="true">↺</span>
            </button>
          ))
        ))}
      {shown && onClear && (
        <button type="button" className="riso-removed-clear" onClick={onClear}>
          {clearLabel}
        </button>
      )}
    </div>
  );
}
