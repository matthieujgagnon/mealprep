import { dict, t } from "../i18n/index.js";
import { formatRecipeTime } from "../lib/mealSlots.js";
import { pillClass, salePillText } from "../lib/pills.js";
import { isStorage } from "../lib/shelves.js";

// Riso v2 shared pills and chips (design: docs/design/riso-v2, "Pill Study").
// Use these instead of writing a new pill class on a screen. The look lives
// in index.css under "Riso v2 pills"; the strings are in `pills.*` (en.js, fr.js).
//
//   <Pill>            the base. Props: size ("mini" 15px, "tag" 22px, "fact" 26px, "chip" 32px,
//                     "badge" round count), tone (yellow, pink, hot, green, blue,
//                     ink, canvas, dash; none = paper), sticker (tilted),
//                     selected (light blue fill + small blue shadow), outlineBlue.
//                     With onClick it is a <button>; with `selected` set it also
//                     reports aria-pressed.
//   <TimePill>        yellow, "⏱ 40 min" or "6 h". With `serves`, "⏱ 40 min | Serves 4"
//                     in one pill (the recipe pop-out). Nothing when there is no time.
//   <ServesPill>      "Serves 4" (FR "4 portions").
//   <MealChip>        the meal type (breakfast, dinner...) as an outlined canvas chip.
//                     "dinner" is written Supper / Souper.
//   <PlannedPill>     pink "Planned Wednesday" (FR "Prévu mercredi"); dayOfWeek is
//                     0 = Monday, as in the Planner.
//   <ToBuyPill>       yellow "3 to buy" (FR "3 à acheter"). Nothing when 0: nothing
//                     to buy is green, and said elsewhere.
//   <InStockPill>     "✓ Onion" for an ingredient you have: a green ✓ circle.
//   <SalePill>        green "-40 % Metro 5,99 $". Any of percent, store, price.
//                     Only a label; SaleTag is the one that opens the deal.
//   <CountPill>       round count. tone: green (ready), yellow (nearly), none (the rest),
//                     blue; outlineBlue for the In your week group.
//   <StorageLabel>    « Congél. » / « Frigo » / « Garde-manger »: where an item is KEPT, on a tile or a
//                     row that sits on a shelf that is not the shelf of where it is kept (Prepared
//                     meals, Leftovers, a section of their own). A mini dashed pill, neutral: no blue,
//                     green, yellow or pink. `storage` is "fridge" | "freezer" | "pantry".
//   <PreparedTag>     the « plat préparé » / "prepared meal" tag: an ink pill with cream text
//                     and a takeout-box glyph (design: docs/design/prepared-tag/). The ONE tag
//                     for a prepared meal, on Inventory items and on recipes. Props: size
//                     ("s" 15px: tiles, rows, Planner cards; "m" 18px: recipe and search
//                     cards; "l" 22px: the pop-out chip row and the item pop-up's switch) and
//                     sticker (tilted +3° and not clickable, for on top of a photo or across a
//                     card's edge; upright in a line of text or chips). Where it sits is the
//                     caller's CSS class (`className`), never a second tag.
//
// Colour roles: pink = when (planned, expiring), yellow = a measure or something
// to buy, green = good (ready, on sale, in stock), blue = the main action or
// what is selected. Every pill has a black outline, thinner on the small ones.

export function Pill({
  size = "tag",
  tone,
  sticker,
  selected,
  outlineBlue,
  as,
  className,
  onClick,
  children,
  ...rest
}) {
  const classes = pillClass({ size, tone, sticker, selected, outlineBlue, className });
  const Tag = as || (onClick ? "button" : "span");
  const extra = {};
  if (Tag === "button") {
    extra.type = "button";
    if (selected !== undefined) extra["aria-pressed"] = !!selected;
  }
  return (
    <Tag className={classes} onClick={onClick} {...extra} {...rest}>
      {children}
    </Tag>
  );
}

export function TimePill({ minutes, serves, size = serves ? "fact" : "tag", ...rest }) {
  const time = formatRecipeTime(minutes);
  if (!time) return null;
  return (
    <Pill size={size} tone="yellow" {...rest}>
      <span className="riso-pill-clock" aria-hidden="true">
        ⏱
      </span>
      {time}
      {serves ? (
        <>
          <span className="riso-pill-divider" aria-hidden="true" />
          {t("pills.serves", { count: serves })}
        </>
      ) : null}
    </Pill>
  );
}

export function ServesPill({ count, size = "tag", ...rest }) {
  if (!count) return null;
  return (
    <Pill size={size} {...rest}>
      {t("pills.serves", { count })}
    </Pill>
  );
}

export function MealChip({ mealType, size = "fact", ...rest }) {
  if (!mealType || !(mealType in dict().recipes.mealTypes)) return null;
  return (
    <Pill size={size} tone="canvas" {...rest}>
      {t(`recipes.mealTypes.${mealType}`)}
    </Pill>
  );
}

export function PlannedPill({ dayOfWeek, size = "fact", ...rest }) {
  const day = dict().days.long[dayOfWeek];
  if (!day) return null;
  return (
    <Pill size={size} tone="pink" {...rest}>
      {t("pills.planned", { day })}
    </Pill>
  );
}

export function ToBuyPill({ count, size = "tag", ...rest }) {
  if (!count) return null;
  return (
    <Pill size={size} tone="yellow" {...rest}>
      {t("pills.toBuy", { count })}
    </Pill>
  );
}

export function InStockPill({ children, size = "chip", ...rest }) {
  return (
    <Pill size={size} className="has-mark" {...rest}>
      <span className="riso-pill-mark" aria-hidden="true">
        ✓
      </span>
      <span className="riso-pill-sr">{t("pills.inStock")}: </span>
      {children}
    </Pill>
  );
}

export function SalePill({ percent, store, price, size = "tag", ...rest }) {
  const text = salePillText({ percent, store, price });
  if (!text) return null;
  return (
    <Pill size={size} tone="green" {...rest}>
      {text}
    </Pill>
  );
}

export function CountPill({ count, tone, outlineBlue, ...rest }) {
  return (
    <Pill size="badge" tone={tone} outlineBlue={outlineBlue} {...rest}>
      {count}
    </Pill>
  );
}

// « plat préparé » / "prepared meal": see the comment at the top. Decorative glyph, the word
// is the accessible name.
export function PreparedTag({ size = "s", sticker = false, className, ...rest }) {
  return (
    <span className={`prepared-tag size-${size}${sticker ? " sticker" : ""}${className ? ` ${className}` : ""}`} {...rest}>
      <svg className="prepared-tag-glyph" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2.5 6.5h11l-1.6 7.5H4.1z" />
        <path d="M2.5 6.5 4.6 3.6h6.8l2.1 2.9" />
        <path d="M6.1 3.6c.4-2 3.4-2 3.8 0" />
      </svg>
      {t("preparedMeal.tag")}
    </span>
  );
}

// « Congél. » and friends: see the comment at the top.
export function StorageLabel({ storage, className, ...rest }) {
  if (!isStorage(storage)) return null;
  return (
    <Pill size="mini" tone="dash" className={`storage-label${className ? ` ${className}` : ""}`} title={t(`inventory.storage.title.${storage}`)} {...rest}>
      {t(`inventory.storage.short.${storage}`)}
    </Pill>
  );
}
