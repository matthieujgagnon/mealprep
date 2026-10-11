import { useEffect, useRef, useState } from "react";
import { HintStrip } from "./RisoControls.jsx";
import { RecipePhoto } from "./RecipePhoto.jsx";
import { foodEmoji } from "../lib/dealEmoji.js";
import { amountText, shelfGroups, takeOutCounts } from "../lib/cookedView.js";
import { parseQuantityInput, unitLabel } from "../lib/units.js";
import { dict, getLang, t } from "../i18n/index.js";

// The pieces of the finished view (design: docs/design/riso-v2-cook-mode/, "Cook
// Mode Finished.dc.html" and the README's "Finished view"): the Leftovers card,
// the "Take out of your Inventory" card with its rows, and the pop-up.
// CookedView.jsx lays them out and keeps what was answered.

// The small Undo on a card once it is answered: an ink outline with a blue shadow.
function UndoButton({ onClick, disabled }) {
  return (
    <button type="button" className="ck-undo riso-press" onClick={onClick} disabled={disabled}>
      {t("cooked.undo")}
    </button>
  );
}

function CardHead({ badge, tone, children, action }) {
  return (
    <div className="ck-card-head">
      <span className={`ck-badge ${tone}`} aria-hidden="true">
        {badge}
      </span>
      <h2 className="ck-card-title">{children}</h2>
      {action}
    </div>
  );
}

// The leftover item as Inventory will show it: photo, name, "2 portions ·
// Fridge" and the yellow LEFTOVER tag.
function LeftoverPreview({ recipe, portions, placeLabel }) {
  return (
    <div className="ck-preview">
      <span className={`ck-preview-photo${recipe.photoUrl ? "" : " empty"}`}>
        {recipe.photoUrl && <RecipePhoto src={recipe.photoUrl} alt="" />}
      </span>
      <div className="ck-preview-main">
        <span className="ck-preview-name">{recipe.title}</span>
        <span className="ck-preview-line">
          <span>{t("cooked.leftovers.line", { count: portions, place: placeLabel })}</span>
          <span className="ck-leftover-tag">{t("cooked.leftovers.tag")}</span>
        </span>
      </div>
    </div>
  );
}

// Leftovers first: how many portions are left (one square each), Fridge or
// Freezer, and the item that "+ Add to Inventory" saves. This card is the
// confirmation: what it shows is exactly what is added (CLAUDE.md).
export function LeftoversCard({ userId, recipe, servings, state, portions, place, places, busy, phone, onPortions, onPlace, onAdd, onNone, onUndo }) {
  const placeLabel = places.find((p) => p.id === place)?.label;
  if (state !== "active") {
    return (
      <section className="ck-card done" aria-label={t("cooked.leftovers.title")}>
        <CardHead badge="✓" tone="green" action={<UndoButton onClick={onUndo} disabled={busy} />}>
          {state === "added" ? t("cooked.leftovers.added") : t("cooked.leftovers.none")}
        </CardHead>
        {state === "added" ? (
          <LeftoverPreview recipe={recipe} portions={portions} placeLabel={placeLabel} />
        ) : (
          <p className="ck-quiet">{t("cooked.leftovers.noneText")}</p>
        )}
      </section>
    );
  }
  const squares = Math.max(1, Math.round(servings || 1));
  return (
    <section className="ck-card live" aria-label={t("cooked.leftovers.title")}>
      <CardHead badge="+" tone="blue">
        {t("cooked.leftovers.title")}
      </CardHead>
      <HintStrip userId={userId} screenKey="cooked-leftovers" items={dict().cooked.leftovers.how} />
      <div className="ck-portions">
        <div className="ck-portions-head">
          <span>{t("cookMode.portionsLeft")}</span>
          <strong>{t("cooked.leftovers.portionsOf", { n: portions, total: squares })}</strong>
        </div>
        <div className="ck-squares" style={{ "--ck-squares": Math.min(squares, phone ? 4 : 6) }}>
          {Array.from({ length: squares }, (_, i) => {
            const on = i < portions;
            return (
              <button
                key={i}
                type="button"
                className={`ck-square${on ? " on" : ""}`}
                aria-pressed={on}
                aria-label={t("cooked.leftovers.portionAria", { count: i + 1 })}
                onClick={() => onPortions(portions === i + 1 ? i : i + 1)}
              >
                {on ? i + 1 : ""}
              </button>
            );
          })}
        </div>
      </div>
      <div className="ck-places" role="radiogroup">
        {places.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={place === p.id} className={`ck-place${place === p.id ? " on" : ""}`} onClick={() => onPlace(p.id)}>
            {p.label}
            <span className="ck-place-range">{p.range}</span>
          </button>
        ))}
      </div>
      <LeftoverPreview recipe={recipe} portions={portions} placeLabel={placeLabel} />
      <div className="ck-actions">
        <button type="button" className="ck-btn primary riso-press" onClick={onAdd} disabled={busy}>
          {t("cooked.leftovers.add")}
        </button>
        <button type="button" className="ck-btn riso-press" onClick={onNone} disabled={busy}>
          {t("cooked.leftovers.none")}
        </button>
      </div>
    </section>
  );
}

// An amount as it is typed: "0.9" or « 0,9 ».
const typedAmount = (qty) => (getLang() === "fr" ? String(qty).replace(".", ",") : String(qty));

// The amount that comes out, as a highlighter mark. Tapping it makes it a box to
// type in; Enter or tapping away keeps it, Escape puts it back.
function AmountMark({ row, editing, onEdit, onDone }) {
  const inputRef = useRef(null);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (editing) {
      setDraft(typeof row.amount === "number" ? typedAmount(row.amount) : "");
      setTimeout(() => inputRef.current?.select(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  const unit = row.item.unit && row.item.unit !== "unit" ? unitLabel(row.item.unit, 2) : "";

  if (editing || row.ask) {
    const keep = () => {
      const qty = parseQuantityInput(draft);
      onDone(qty == null ? undefined : qty);
    };
    if (row.ask && row.before == null) {
      // No amount in Inventory: either it's all used up, or it stays.
      return (
        <button
          type="button"
          className={`ck-allofit${row.amount === "all" ? " on" : ""}`}
          aria-pressed={row.amount === "all"}
          onClick={(e) => {
            e.stopPropagation();
            onDone(row.amount === "all" ? null : "all");
          }}
        >
          {t("cooked.inventory.allOfIt")}
        </button>
      );
    }
    return (
      <span className="ck-amount-edit" onClick={(e) => e.stopPropagation()}>
        <span className="ck-amount-sign" aria-hidden="true">
          −
        </span>
        <input
          ref={inputRef}
          className="ck-amount-input"
          inputMode="decimal"
          value={editing ? draft : typeof row.amount === "number" ? typedAmount(row.amount) : ""}
          placeholder="0"
          aria-label={t("cooked.inventory.amountAria", { name: row.item.name, unit: unit || "—" })}
          onFocus={() => !editing && onEdit()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={keep}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onDone(undefined);
            }
          }}
        />
        {unit && <span className="ck-amount-unit">{unit}</span>}
      </span>
    );
  }
  if (!row.on) return <span className="ck-stays">{t("cooked.inventory.stay")}</span>;
  return (
    <button
      type="button"
      className="ck-highlight"
      aria-label={t("cooked.inventory.editAria", { name: row.item.name })}
      onClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
    >
      {t("cooked.inventory.take", { amount: row.amount === "all" ? t("cooked.inventory.allOfIt") : amountText(row.amount, row.item.unit) })}
    </button>
  );
}

// The line under an item's name: what will be left, or what stays.
function rowLine(row) {
  if (row.staple && !row.on) return t("cooked.inventory.staple");
  if (row.ask && !row.on) return row.before == null ? t("cooked.inventory.noAmount") : t("cooked.inventory.ask");
  if (!row.on) return row.before == null ? t("cooked.inventory.noAmount") : t("cooked.inventory.inInventory", { amount: amountText(row.before, row.item.unit) });
  if (row.after == null) return t("cooked.inventory.noAmount");
  if (row.after <= 0) return t("cooked.inventory.noneLeft");
  return t("cooked.inventory.leftAfter", { amount: amountText(row.after, row.item.unit) });
}

function RunningLow({ name, listed, onClick }) {
  return (
    <button
      type="button"
      className={`ck-low riso-press${listed ? " listed" : ""}`}
      disabled={listed}
      onClick={(e) => {
        e.stopPropagation();
        onClick(name);
      }}
    >
      {listed ? t("cooked.inventory.onList") : t("cooked.inventory.runningLow")}
    </button>
  );
}

function ItemRow({ row, editing, listed, onToggle, onEdit, onAmount, onRunningLow }) {
  const name = row.item.name;
  return (
    <div
      className={`ck-row${row.on ? " on" : ""}`}
      role="checkbox"
      aria-checked={row.on}
      aria-label={t("cooked.inventory.tickAria", { name })}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <span className="ck-row-emoji" aria-hidden="true">
        {foodEmoji(name, row.item.category) || "🥫"}
      </span>
      <span className="ck-row-main">
        <span className="ck-row-name">{name}</span>
        <span className="ck-row-line">{rowLine(row)}</span>
      </span>
      {row.staple && !row.on && <RunningLow name={name} listed={listed} onClick={onRunningLow} />}
      <AmountMark row={row} editing={editing} onEdit={onEdit} onDone={onAmount} />
      <span className="ck-tick" aria-hidden="true">
        {row.on ? "✓" : ""}
      </span>
    </div>
  );
}

function OtherRow({ row, listed, onRunningLow }) {
  const name = row.names[0];
  return (
    <div className="ck-row other">
      <span className="ck-row-emoji" aria-hidden="true">
        {foodEmoji(name) || "🥫"}
      </span>
      <span className="ck-row-main">
        <span className="ck-row-name">{name}</span>
        <span className="ck-row-line">{row.kind === "staple" ? t("cooked.inventory.staple") : t("cooked.inventory.missingLine")}</span>
      </span>
      {row.kind === "staple" && <RunningLow name={name} listed={listed} onClick={onRunningLow} />}
    </div>
  );
}

// The review list: each ingredient's Inventory item and the amount that comes
// out, under its shelf, then the pantry staples and what isn't in Inventory.
export function TakeOutCard({ userId, rows, state, dim, busy, shelfName, listed, onToggle, onAmount, onRunningLow, onRemove, onNotNow, onUndo }) {
  const [editing, setEditing] = useState(null);
  const counts = takeOutCounts(rows);
  if (state !== "active") {
    return (
      <section className="ck-card done" aria-label={t("cooked.inventory.title")}>
        <CardHead badge="−" tone="green">
          {t("cooked.inventory.title")}
        </CardHead>
        <div className="ck-summary">
          <span className="ck-badge green small" aria-hidden="true">
            ✓
          </span>
          <span className="ck-summary-text">
            {state === "removed" ? t("cooked.inventory.removed", { count: counts.on }) : t("cooked.inventory.leftAsWas")}
          </span>
          <UndoButton onClick={onUndo} disabled={busy} />
        </div>
      </section>
    );
  }
  const groups = shelfGroups(rows, shelfName);
  return (
    <section className={`ck-card${dim ? " dim" : " live"}`} aria-label={t("cooked.inventory.title")} aria-disabled={dim || undefined} inert={dim ? "" : undefined}>
      <CardHead badge="−" tone="green">
        {t("cooked.inventory.title")}
      </CardHead>
      <HintStrip userId={userId} screenKey="cooked-inventory" items={dict().cooked.inventory.how} />
      {counts.total > 0 ? (
        <div className="ck-count">
          <div className="ck-count-line">
            <span>{t("cooked.inventory.count", { n: counts.on, count: counts.total })}</span>
            <span>{counts.stays ? t("cooked.inventory.stays", { count: counts.stays }) : t("cooked.inventory.allOut")}</span>
          </div>
          <div className="ck-count-bar">
            <div style={{ width: `${counts.pct}%` }} />
          </div>
        </div>
      ) : (
        <p className="ck-quiet">{t("cooked.inventory.nothing")}</p>
      )}
      <div className="ck-shelves">
        {groups.map((group) => {
          const items = group.rows.filter((r) => r.kind === "item");
          const label = group.key === "staple" ? t("cooked.inventory.alwaysHave") : group.key === "missing" ? t("cooked.inventory.missing") : group.label;
          return (
            <div key={group.key} className={`ck-shelf ${group.key === "missing" || group.key === "staple" ? "quiet" : ""}`}>
              <div className="ck-shelf-head">
                <span>{label}</span>
                {items.length > 0 && <span>{`${items.filter((r) => r.on).length} / ${items.length}`}</span>}
              </div>
              <div className="ck-rows">
                {group.rows.map((row) =>
                  row.kind === "item" ? (
                    <ItemRow
                      key={row.key}
                      row={row}
                      editing={editing === row.key}
                      listed={listed.has(row.item.name)}
                      onToggle={() => onToggle(row)}
                      onEdit={() => setEditing(row.key)}
                      onAmount={(amount) => {
                        setEditing(null);
                        onAmount(row, amount);
                      }}
                      onRunningLow={onRunningLow}
                    />
                  ) : (
                    <OtherRow key={row.key} row={row} listed={listed.has(row.names[0])} onRunningLow={onRunningLow} />
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="ck-actions">
        <button type="button" className="ck-btn primary riso-press" onClick={onRemove} disabled={busy || dim}>
          {t("cooked.inventory.remove")}
        </button>
        <button type="button" className="ck-btn riso-press" onClick={onNotNow} disabled={busy || dim}>
          {t("cooked.inventory.notNow")}
        </button>
      </div>
    </section>
  );
}

// After either Inventory button: "Enjoy your supper", one line on what
// changed, Back to the app (the confetti) and Stay on this page.
export function DoneModal({ mealType, taken, portions, onBack, onStay }) {
  const backRef = useRef(null);
  useEffect(() => {
    backRef.current?.focus();
    function onKey(e) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onStay();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onStay]);
  const line = [
    taken > 0 ? t("cooked.modal.taken", { count: taken }) : t("cooked.modal.unchanged"),
    portions > 0 ? t("cooked.modal.leftovers", { count: portions }) : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="ck-modal-backdrop" onClick={onStay}>
      <div className="ck-modal" role="dialog" aria-modal="true" aria-labelledby="ck-modal-title" onClick={(e) => e.stopPropagation()}>
        <span className="ck-sticker small">{t("cookMode.allDone")}</span>
        <h2 id="ck-modal-title" className="ck-modal-title">
          {t(`cooked.modal.title.${mealType}`)}
        </h2>
        <p className="ck-modal-text">{line}</p>
        <button ref={backRef} type="button" className="ck-btn primary wide riso-press" onClick={onBack}>
          {t("cooked.modal.back")}
        </button>
        <button type="button" className="ck-link" onClick={onStay}>
          {t("cooked.modal.stay")}
        </button>
      </div>
    </div>
  );
}
