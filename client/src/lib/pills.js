import { t } from "../i18n/index.js";
import { localizePrice } from "../i18n/format.js";

// The text and class names behind components/RisoPills.jsx, kept here so they
// can be tested without a browser.

const SIZES = ["tag", "fact", "chip", "badge"];
const TONES = ["yellow", "pink", "hot", "green", "blue", "ink", "canvas", "dash"];

// "riso-pill size-tag tone-yellow is-selected": a size, an optional tone
// (none = paper), and the tilt, selected and blue-outline flags.
export function pillClass({ size = "tag", tone, sticker, selected, outlineBlue, className } = {}) {
  if (!SIZES.includes(size)) throw new Error(`Unknown pill size: ${size}`);
  if (tone && !TONES.includes(tone)) throw new Error(`Unknown pill tone: ${tone}`);
  return [
    "riso-pill",
    `size-${size}`,
    tone && `tone-${tone}`,
    sticker && "sticker",
    selected && "is-selected",
    outlineBlue && "outline-blue",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

// "-40 %" in French, "-40%" in English. Empty when there is no percentage.
export function salePercentText(percent) {
  const n = Math.round(Number(percent));
  return Number.isFinite(n) && n > 0 ? t("pills.salePercent", { n }) : "";
}

// "-40 % Metro 5,99 $": what the green sale tag says. Any part can be missing.
export function salePillText({ percent, store, price } = {}) {
  return [salePercentText(percent), store, price ? localizePrice(price) : ""].filter(Boolean).join(" ");
}
