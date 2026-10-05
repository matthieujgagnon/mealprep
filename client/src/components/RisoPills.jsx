import { dict, t } from "../i18n/index.js";
import { formatRecipeTime } from "../lib/mealSlots.js";
import { pillClass, salePillText } from "../lib/pills.js";

// Riso v2 shared pills and chips (design: docs/design/riso-v2, "Pill Study").
// Use these instead of writing a new pill class on a screen. The look lives
// in index.css under "Riso v2 pills"; the strings are in `pills.*` (en.js, fr.js).
//
//   <Pill>            the base. Props: size ("tag" 22px, "fact" 26px, "chip" 32px,
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
