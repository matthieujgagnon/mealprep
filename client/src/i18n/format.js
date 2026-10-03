// Money, numbers and dates the way each language writes them: "$4.99" and
// "Mon, Sep 28" in English, "4,99 $" and "lun. 28 sept." in Quebec French.
import { getLang, locale, t } from "./index.js";

const moneyCache = new Map();
function moneyFormat(lang) {
  if (!moneyCache.has(lang)) {
    moneyCache.set(
      lang,
      new Intl.NumberFormat(locale(lang), { style: "currency", currency: "CAD", currencyDisplay: "narrowSymbol" })
    );
  }
  return moneyCache.get(lang);
}

// 4.99 -> "$4.99" / "4,99 $"
export function formatMoney(n, lang = getLang()) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  return moneyFormat(lang).format(Number(n));
}

// 1234.5 -> "1,234.5" / "1 234,5"
export function formatNumber(n, opts, lang = getLang()) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  return new Intl.NumberFormat(locale(lang), opts).format(Number(n));
}

// The "per" after a price: "/lb", "/kg", "/100 g" stay as they are in both
// languages; "each" is "ea" in English, "ch." (chacun) in French.
export function perUnit(basis, lang = getLang()) {
  if (!basis) return "";
  if (basis === "each") return ` ${t("units.each", null, lang)}`;
  return `/${basis}`;
}

// 4.99, "lb" -> "$4.99/lb" / "4,99 $/lb"
export function formatUnitPrice(n, basis, lang = getLang()) {
  const money = formatMoney(n, lang);
  return money ? `${money}${perUnit(basis, lang)}` : "";
}

// A flyer's own price text ("$4.99", "2/$5", "$3.99/lb", "2 for $5.00",
// "Save $2", "$2.00 off") in French: "4,99 $", "2/5,00 $", "3,99 $/lb",
// "2 pour 5,00 $", "Économisez 2,00 $", "2,00 $ de rabais". Anything it
// can't read is left alone.
const MONEY_IN_TEXT = /\$\s?(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?\$/g;
export function localizePrice(text, lang = getLang()) {
  // English shows the flyer's own words, as it always has.
  if (!text || lang === "en") return text;
  let out = String(text).replace(MONEY_IN_TEXT, (m, before, after) => {
    const n = Number(String(before ?? after).replace(",", "."));
    return Number.isFinite(n) ? formatMoney(n, lang) : m;
  });
  if (lang === "fr") {
    out = out
      .replace(/\bfor\b/gi, "pour")
      .replace(/\bea\.?(?=\W|$)/gi, "ch.")
      .replace(/\beach\b/gi, "ch.")
      .replace(/\bSave\b/g, "Économisez")
      .replace(/\bsave\b/g, "économisez")
      .replace(/\boff\b/gi, "de rabais")
      .replace(/^Points offer$/i, "Offre de points")
      .replace(/^Free with purchase$/i, "Gratuit à l'achat")
      .replace(/^Worth\b/i, "Valeur de");
  }
  return out;
}

function asDate(d) {
  if (d instanceof Date) return d;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day);
  }
  return new Date(d);
}

// Any Intl date format: formatDate(d, { weekday: "short", day: "numeric", month: "short" })
export function formatDate(d, opts, lang = getLang()) {
  const date = asDate(d);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale(lang), opts).format(date);
}

// "Mon, Sep 28" / "lun. 28 sept."
export function formatShortDay(d, lang = getLang()) {
  return formatDate(d, { weekday: "short", month: "short", day: "numeric" }, lang);
}

// "Sep 28" / "28 sept."
export function formatMonthDay(d, lang = getLang()) {
  return formatDate(d, { month: "short", day: "numeric" }, lang);
}

// "Monday" / "lundi"
export function formatWeekday(d, style = "long", lang = getLang()) {
  return formatDate(d, { weekday: style }, lang);
}

// A list read aloud: "A, B and C" / "A, B et C"
export function formatList(items, lang = getLang()) {
  const list = (items || []).filter((x) => x != null && x !== "");
  if (list.length === 0) return "";
  return new Intl.ListFormat(locale(lang), { style: "long", type: "conjunction" }).format(list.map(String));
}

// How long food keeps, the way the USDA FoodKeeper app says it: days under
// a month, then months, then years ("5–7 days", "3–6 months", "1 year" /
// "5 à 7 jours", "3 à 6 mois", "1 an").
export function formatDayRange(min, max, lang = getLang()) {
  const one = (unit, n) => t(`duration.${unit}`, { count: n }, lang);
  const range = (unit, a, b) => (a === b ? one(unit, a) : t(`duration.${unit}Range`, { min: a, max: b }, lang));
  if (max < 30) return range("days", min, max);
  if (max < 365) return range("months", Math.max(1, Math.round(min / 30)), Math.max(1, Math.round(max / 30)));
  return range("years", Math.max(1, Math.round(min / 365)), Math.max(1, Math.round(max / 365)));
}
