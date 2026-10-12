import { useEffect, useMemo, useState } from "react";
import { GroceryItem } from "./GroceryItem.jsx";
import { buildGroceryList, capitalize } from "../lib/groceryList.js";
import { BOUGHT, QUEUED, TO_BUY, nextStep } from "../lib/groceryChecks.js";
import { t } from "../i18n/index.js";

// The pieces of the Grocery page that aren't a row (design:
// docs/design/riso-v2-grocery/README.md): the cart, a group's "Add to
// inventory" footer and the How it works demo. GroceryList.jsx puts them together.

// The cart: everything checked (bought ✓ or queued +), a progress bar and Done
// shopping. One component: the pink card in the side column on a computer
// (`bar` false), and on a phone a small bar at the top of the list (§5).
export function GroceryCart({ bar = false, count, pct, done, allBought, queuedCount, onDone }) {
  const disabled = count === 0;
  if (bar) {
    return (
      <section className="riso-grocery-cartbar" aria-label={t("grocery.inCart")}>
        <div className="riso-grocery-cartbar-top">
          <span className="riso-grocery-cartbar-num">{count}</span>
          <div className="riso-grocery-cartbar-words">
            <span className="riso-grocery-cartbar-eyebrow">{t("grocery.inCart")}</span>
            <span className="riso-grocery-cartbar-label">{t("grocery.itemsChecked", { count })}</span>
          </div>
          <button type="button" className="riso-grocery-cartbar-btn" disabled={disabled} onClick={onDone}>
            {t("grocery.doneShort")}
          </button>
        </div>
        <div className="riso-grocery-cartbar-track" aria-hidden="true">
          <div style={{ width: `${pct}%` }} />
        </div>
      </section>
    );
  }
  return (
    <section className={`riso-grocery-cart${done ? " done" : ""}`}>
      <div className="riso-eyebrow on-pink">{t("grocery.inCart")}</div>
      <div className="riso-grocery-cart-count">
        <span className="riso-grocery-cart-num">{count}</span>
        <span className="riso-grocery-cart-label">{t("grocery.itemsChecked", { count })}</span>
      </div>
      <div className="riso-grocery-cart-track">
        <div className="riso-grocery-cart-fill" style={{ width: `${pct}%` }} />
      </div>
      {allBought ? (
        <p className="riso-grocery-cart-done">{t("grocery.groceriesDone")}</p>
      ) : (
        <button type="button" className="riso-grocery-cart-btn" disabled={disabled} onClick={onDone}>
          {queuedCount > 0 ? t("grocery.doneShopping", { count: queuedCount }) : t("grocery.doneShort")}
        </button>
      )}
      <p className="riso-grocery-cart-note">{t("grocery.cartNote")}</p>
    </section>
  );
}

// Under a group with something queued: "2 queued · Milk 2%, Eggs" and the one
// button that sends exactly those to Inventory, through the confirmation sheet (§2).
export function GroupFooter({ items, onAdd }) {
  const count = items.length;
  const names = items.map((item) => capitalize(item.name)).join(", ");
  return (
    <div className="riso-group-foot">
      <p className="riso-group-foot-text" title={names}>
        {t("grocery.queuedCount", { count })} · {names}
      </p>
      <button type="button" className="riso-group-foot-btn" onClick={onAdd}>
        {t("grocery.addQueued", { count })}
      </button>
    </div>
  );
}

// The sample blue button and sale chip in the tips (not buttons: they only show the look).
function SampleAddButton() {
  return (
    <span className="riso-group-foot-btn sample" aria-hidden="true">
      {t("grocery.addQueued", { count: 2 })}
    </span>
  );
}

function SampleSale() {
  return (
    <span className="riso-row-deal sample" aria-hidden="true">
      <span className="riso-row-deal-dot" />
      <span className="riso-row-deal-price">{t("help.sample.price")}</span>
      <span className="riso-row-deal-go">›</span>
    </span>
  );
}

const STEPS = [
  { step: BOUGHT, title: "grocery.hint.once", sub: "grocery.hint.onceSub", mark: "✓" },
  { step: QUEUED, title: "grocery.hint.twice", sub: "grocery.hint.twiceSub", mark: "+" },
  { step: TO_BUY, title: "grocery.hint.again", sub: "grocery.hint.againSub", mark: "" },
];

// The body of Grocery's How it works strip (§6): a live demo row that goes
// through the three steps every 1.8 s until it is tapped (then each tap moves it
// on), the three steps beside it with the one just reached outlined, and two
// tips. Nothing here is saved. It doesn't move by itself when the device asks for
// less motion.
export function GroceryHowItWorks() {
  const [step, setStep] = useState(TO_BUY);
  const [reached, setReached] = useState(false);
  const [tapped, setTapped] = useState(false);
  const demoName = t("grocery.hint.demoItem");
  const item = useMemo(() => buildGroceryList([], [], {}, [], [{ id: "demo", name: demoName, quantity: 2, unit: null }])[0], [demoName]);

  useEffect(() => {
    if (tapped) return undefined;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const id = setInterval(() => {
      setStep((s) => nextStep(s));
      setReached(true);
    }, 1800);
    return () => clearInterval(id);
  }, [tapped]);

  return (
    <div className="riso-ghint">
      <div className="riso-ghint-body">
        <div className="riso-ghint-demo">
          <div className="riso-ghint-row">
            <GroceryItem
              item={item}
              checked={step !== TO_BUY}
              queued={step === QUEUED}
              onToggle={() => {
                setTapped(true);
                setReached(true);
                setStep((s) => nextStep(s));
              }}
            />
          </div>
          <p className="riso-ghint-caption">{t(tapped ? "grocery.hint.keepClicking" : "grocery.hint.tryIt")}</p>
        </div>
        <ul className="riso-ghint-steps">
          {STEPS.map((s) => (
            <li key={s.step} className={`riso-ghint-step${reached && s.step === step ? ` on step-${s.step}` : ""}`}>
              <span className={`riso-ghint-box${s.mark ? " filled" : ""}`} aria-hidden="true">
                {s.mark}
              </span>
              <span className="riso-ghint-step-title">{t(s.title)}</span>
              <span className="riso-ghint-step-sub">{t(s.sub)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="riso-ghint-tips">
        <p className="riso-ghint-tip">
          <SampleAddButton />
          <span>{t("grocery.hint.tipAdd")}</span>
        </p>
        <p className="riso-ghint-tip">
          <SampleSale />
          <span>{t("grocery.hint.tipSale")}</span>
        </p>
      </div>
    </div>
  );
}
