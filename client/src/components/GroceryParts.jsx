import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GroceryItem } from "./GroceryItem.jsx";
import { buildGroceryList, capitalize } from "../lib/groceryList.js";
import { BOUGHT, QUEUED, TO_BUY, nextStep } from "../lib/groceryChecks.js";
import { EASE, T, flash, play, prefersReducedMotion, whenDone } from "../lib/motion.js";
import { t } from "../i18n/index.js";

// The pieces of the Grocery page that aren't a row (design:
// docs/design/riso-v2-grocery/README.md): the cart, a group's "Add to
// inventory" footer and the How it works demo. GroceryList.jsx puts them together.

// The cart: everything checked (bought ✓ or queued +), a progress bar and Done
// shopping. One component with three looks: the pink card in the side column on a
// computer (the default), on a phone a small bar at the top of the list (`bar`, with the
// « Je suis à l'épicerie » button inside it), and on a phone, once that bar has scrolled
// out of sight, a docked copy at the bottom of the screen (`dock`, shown while `on`, with a
// shop-icon button for Store mode). The one thing that floats at the bottom of the phone.
// Whichever look is showing is what the name chip flies to, and its number is `data-cart-num`.
// `pulse` ({ n, dir }) is the list saying "the count just changed": the number bumps up
// (dir 1) or dips (dir -1), or for someone who asked for less motion the whole cart flashes.
// Design: docs/design/riso-v2-grocery-check-feedback/README.md §2, §5, §7.
export function GroceryCart({ bar = false, dock = false, on = true, cartRef, count, canDone = count > 0, pct, done, allBought, queuedCount, onDone, onStoreMode, pulse }) {
  // `count` is the number shown, which leaves out an item whose chip is still on its way;
  // Done shopping goes by the real cart (`canDone`), so it never waits for the chip.
  const disabled = !canDone;
  const holder = useRef(null);
  const number = useRef(null);
  const setHolder = useCallback(
    (el) => {
      holder.current = el;
      cartRef?.(el);
    },
    [cartRef]
  );

  const lastPulse = useRef(pulse?.n);
  useLayoutEffect(() => {
    if (!pulse || pulse.n === lastPulse.current) return;
    lastPulse.current = pulse.n;
    if (!holder.current) return; // the dock, while it isn't showing
    if (prefersReducedMotion()) {
      flash(holder.current, getComputedStyle(holder.current).getPropertyValue("--riso-yellow").trim());
      return;
    }
    const scale = pulse.dir > 0 ? 1.22 : 0.88;
    const [, duration] = T.check.count;
    play(
      number.current,
      [{ transform: "scale(1)" }, { transform: `scale(${scale})`, offset: 0.4 }, { transform: "scale(1)" }],
      { duration, easing: EASE.out }
    );
  }, [pulse?.n]);

  // The dock comes up from 12 px below as it fades in (only the fade for reduced motion).
  useLayoutEffect(() => {
    if (dock && on) play(holder.current, [{ opacity: 0, transform: "translateY(12px)" }], { duration: T.dockIn, fill: "backwards" });
  }, [dock && on]);

  if (dock) {
    if (!on) return null;
    return (
      <section ref={setHolder} className="riso-grocery-dock" aria-label={t("grocery.inCart")} data-cart="dock">
        <span className="riso-grocery-dock-num" data-cart-num ref={number}>
          {count}
        </span>
        <div className="riso-grocery-dock-mid">
          <span className="riso-grocery-dock-label">{t("grocery.inCart")}</span>
          <div className="riso-grocery-dock-track" aria-hidden="true">
            <div style={{ width: `${pct}%` }} />
          </div>
        </div>
        {onStoreMode && (
          <button type="button" className="riso-grocery-dock-store" aria-label={t("grocery.atStore")} title={t("grocery.atStore")} onClick={onStoreMode}>
            <span className="riso-grocery-dock-store-face">
              <StoreIcon />
            </span>
          </button>
        )}
        <button type="button" className="riso-grocery-cartbar-btn" disabled={disabled} onClick={onDone}>
          {t("grocery.doneShort")}
        </button>
      </section>
    );
  }
  if (bar) {
    return (
      <section ref={setHolder} className="riso-grocery-cartbar" aria-label={t("grocery.inCart")} data-cart="bar">
        <div className="riso-grocery-cartbar-top">
          <span className="riso-grocery-cartbar-num" data-cart-num ref={number}>
            {count}
          </span>
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
        {onStoreMode && (
          <button type="button" className="riso-grocery-cartbar-store" onClick={onStoreMode}>
            <span className="riso-grocery-cartbar-store-name">{t("grocery.atStore")}</span>
            <span className="riso-grocery-cartbar-store-tag">{t("grocery.bigMode")}</span>
          </button>
        )}
      </section>
    );
  }
  return (
    <section ref={setHolder} className={`riso-grocery-cart${done ? " done" : ""}`} data-cart="card">
      <div className="riso-eyebrow on-pink">{t("grocery.inCart")}</div>
      <div className="riso-grocery-cart-count">
        <span className="riso-grocery-cart-num" data-cart-num ref={number}>
          {count}
        </span>
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

// A small shop front: the dock's button for Store mode (its label, « Je suis à
// l'épicerie », is the button's aria-label and tooltip).
function StoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d="M3 9.5 4.6 4h14.8L21 9.5" />
      <path d="M3 9.5c0 1.7 1.3 2.8 3 2.8s3-1.1 3-2.8c0 1.7 1.3 2.8 3 2.8s3-1.1 3-2.8c0 1.7 1.3 2.8 3 2.8s3-1.1 3-2.8" />
      <path d="M5 12.8V20h14v-7.2" />
      <path d="M10 20v-4.5h4V20" />
    </svg>
  );
}

// A text with its number apart, so the number can roll: "2 queued" -> ["", "2", " queued"].
// (The number is found in the finished sentence, so any language's word order works.)
function aroundNumber(text, count) {
  const at = text.search(new RegExp(`(?<!\\d)${count}(?!\\d)`));
  if (at < 0) return [text, "", ""];
  return [text.slice(0, at), String(count), text.slice(at + String(count).length)];
}

// Under a group with something queued: "2 queued · Milk 2%, Eggs" and the one button that
// sends exactly those to Inventory, through the confirmation sheet (§2). It opens when the
// group's first item is queued (height, padding and fade, 200 ms), rolls its two numbers when
// the count changes, and closes when the last one leaves; it stays on screen, with what it last
// said, until it has closed. For reduced motion it flashes instead of moving (§3, §4, §7).
export function GroupFooter({ items, onAdd }) {
  const count = items.length;
  const last = useRef(null); // what it said last, which it keeps saying while it closes
  if (count > 0) last.current = { count, names: items.map((item) => capitalize(item.label)).join(", ") };
  const [open, setOpen] = useState(count > 0); // stays true until the close animation has ended
  const footer = useRef(null);
  const before = useRef(count);
  const closeAnimation = useRef(null);

  useLayoutEffect(() => {
    const was = before.current;
    before.current = count;
    if (was === count) return;
    const el = footer.current;
    const yellow = el ? getComputedStyle(el).getPropertyValue("--riso-yellow").trim() : "";
    const calm = prefersReducedMotion();
    // A footer that was closing and is wanted again: stop the closing first.
    const stopClosing = () => {
      const running = closeAnimation.current;
      closeAnimation.current = null;
      running?.cancel();
    };
    if (count > 0) {
      stopClosing();
      setOpen(true);
      if (!el) return;
      if (calm) {
        flash(el, yellow);
      } else if (was === 0) {
        const edges = openEdges(el);
        play(el, [edges.closed, edges.open], { duration: T.queue.footer[1], delay: T.queue.footer[0], fill: "backwards" });
      } else {
        for (const num of el.querySelectorAll("[data-roll]")) {
          play(num, [{ transform: `translateY(${count > was ? 70 : -70}%)`, opacity: 0 }], { duration: T.roll });
        }
      }
      return;
    }
    // The last one left: the numbers roll down and the footer closes (nothing to close for
    // reduced motion: it goes at once).
    if (calm || !el) {
      setOpen(false);
      return;
    }
    const edges = openEdges(el);
    for (const num of el.querySelectorAll("[data-roll]")) play(num, [{ transform: "translateY(-70%)", opacity: 0 }], { duration: T.roll });
    const out = play(el, [edges.open, edges.closed], { duration: T.back.footer[1], delay: T.back.footer[0], fill: "forwards" });
    closeAnimation.current = out;
    whenDone(out, () => {
      if (out && closeAnimation.current !== out) return; // stopped: it is wanted again
      closeAnimation.current = null;
      setOpen(false);
    });
  }, [count]);

  const closing = open && count === 0;
  if (count === 0 && !closing) return null;
  const shown = last.current;
  const [lead, num, tail] = aroundNumber(t("grocery.queuedCount", { count: shown.count }), shown.count);
  const [addLead, addNum, addTail] = aroundNumber(t("grocery.addQueued", { count: shown.count }), shown.count);
  const rolling = (n) => (
    <span className="mm-roll" data-roll>
      {n}
    </span>
  );
  return (
    <div ref={footer} className="riso-group-foot">
      <p className="riso-group-foot-text" title={shown.names}>
        {lead}
        {num && rolling(num)}
        {tail} · {shown.names}
      </p>
      <button type="button" className="riso-group-foot-btn" disabled={closing} onClick={onAdd}>
        {/* One inline box, so the spaces around the rolling number stay (the button is a flex row). */}
        <span>
          {addLead}
          {addNum && rolling(addNum)}
          {addTail}
        </span>
      </button>
    </div>
  );
}

// The footer's look open and shut, for the open and close animations: the height and the
// padding and top border that go with it, and the fade (§3, §4).
function openEdges(el) {
  const cs = getComputedStyle(el);
  const open = {
    height: `${el.getBoundingClientRect().height - (cs.boxSizing === "border-box" ? 0 : parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth))}px`,
    paddingTop: cs.paddingTop,
    paddingBottom: cs.paddingBottom,
    borderTopWidth: cs.borderTopWidth,
    opacity: 1,
  };
  const closed = { height: "0px", paddingTop: "0px", paddingBottom: "0px", borderTopWidth: "0px", opacity: 0 };
  return { open, closed };
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
  const item = useMemo(() => buildGroceryList([], [{ id: "demo", name: demoName, quantity: 2, unit: null }])[0], [demoName]);

  useEffect(() => {
    if (tapped) return undefined;
    if (prefersReducedMotion()) return undefined;
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
