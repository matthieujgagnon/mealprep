// Reads grocery flyers from Flipp (flipp.com), the service most Canadian
// grocers publish their weekly flyers through. Flipp has no official public
// API; this uses the same keyless JSON its own web app loads
// (backflipp.wishabi.com). It isn't documented and can change without
// notice, so everything here reads fields defensively - a missing or
// renamed field drops that one item rather than failing the whole import.

// FLIPP_BASE_URL overrides it (the e2e tests point it somewhere unreachable).
import { endsOnFood, frenchToEnglish, looksFrench, namesFood, splitBilingual } from "./bilingual.js";

const flippBase = () => process.env.FLIPP_BASE_URL || "https://backflipp.wishabi.com/flipp";
const LB_PER_KG = 0.45359237;

// Flipp answers in the flyer's own language unless asked; English keeps
// item names close to the recipe ingredient names they're matched against.
const LOCALE = "en-ca";

export function normalizePostalCode(postalCode) {
  return String(postalCode || "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function isValidPostalCode(postalCode) {
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(normalizePostalCode(postalCode));
}

async function getJson(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let res;
  try {
    res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (mealprep flyer import)" },
    });
  } catch (err) {
    throw new Error(err.name === "AbortError" ? "Flipp took too long to answer" : "couldn't connect to Flipp");
  }
  try {
    if (!res.ok) throw new Error(`Flipp answered ${res.status} for ${new URL(url).pathname}`);
    try {
      return await res.json();
    } catch {
      throw new Error("Flipp's answer wasn't readable - it may have changed");
    }
  } finally {
    clearTimeout(timer);
  }
}

// The flyer list comes back as { flyers: [...] } (or, on some versions of
// the endpoint, a bare array).
export function readFlyerList(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.flyers) ? data.flyers : [];
  return list
    .map((f) => ({
      id: f.id ?? f.flyer_id,
      merchant: String(f.merchant ?? f.merchant_name ?? f.name ?? "").trim(),
      merchantId: f.merchant_id ?? null,
      validFrom: f.valid_from ?? f.available_from ?? null,
      validTo: f.valid_to ?? f.available_to ?? null,
      categories: Array.isArray(f.categories)
        ? f.categories.map(String)
        : typeof f.categories === "string"
          ? f.categories.split(",").map((c) => c.trim())
          : [],
    }))
    .filter((f) => f.id != null && f.merchant);
}

// A flyer's items come back as { items: [...] } (older versions used
// flyer_items, or a bare array).
export function readFlyerItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.flyer_items)) return data.flyer_items;
  return [];
}

export async function fetchFlyers(postalCode, { fetchImpl = fetch } = {}) {
  const pc = normalizePostalCode(postalCode);
  const data = await getJson(`${flippBase()}/flyers?locale=${LOCALE}&postal_code=${pc}`, fetchImpl);
  return readFlyerList(data);
}

export async function fetchFlyerItems(flyerId, { fetchImpl = fetch } = {}) {
  const id = encodeURIComponent(flyerId);
  const data = await getJson(`${flippBase()}/flyers/${id}?locale=${LOCALE}`, fetchImpl);
  const items = readFlyerItems(data);
  if (items.length > 0) return items;
  // Fall back to the separate items path some versions expose.
  return readFlyerItems(await getJson(`${flippBase()}/flyers/${id}/flyer_items?locale=${LOCALE}`, fetchImpl));
}

// Grocery flyers only - Flipp also carries hardware, clothing, electronics.
export function isGroceryFlyer(flyer) {
  if (flyer.categories.length === 0) return true;
  return flyer.categories.some((c) => /grocer|épicerie|epicerie|food/i.test(c));
}

// "Super C" matches "Super C", "SUPER C" and "Super C (Montreal)"; "IGA"
// matches "IGA extra" but not "BIGAR".
export function merchantMatches(merchant, store) {
  const m = ` ${merchant.toLowerCase()} `;
  const s = store.toLowerCase().trim();
  return m.includes(` ${s} `) || m.trim() === s || m.trim().startsWith(`${s} `);
}

const money = (n) => `$${n.toFixed(2)}`;
const round2 = (n) => Math.round(n * 100) / 100;

function toNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/[^0-9.,]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Flipp splits a printed price into pre_price_text ("2/", "3 POUR"),
// price ("5.00") and price_text / post_price_text ("/lb", "lb", "/LB",
// "le 100 g", "/lb $4.39/kg", "ch.", "+ tx"). The flyer list itself only
// carries the bare price; the texts come from the item's own page (see
// fetchFlippDeals). This rebuilds the printed price and reduces it to one
// comparable number in the app's own bases: per lb for weight, per L for
// volume, else each. A "rabais de 3$" / "save $3" tile is an amount off,
// not a price: the price is the regular price minus it when the item says
// what that is, else it's kept as "$3.00 off" with no comparable price.
export function parseFlippPrice(item) {
  const parts = flippPriceParts(item);
  return parts && { price: parts.price, unitPrice: parts.unitPrice, unitBasis: parts.unitBasis };
}

// parseFlippPrice plus what regularPriceFor needs: the factor the printed
// price was converted by (per kg -> per lb), and a regular price an
// amount-off tile already worked out.
function flippPriceParts(item) {
  const price = toNumber(item.price || item.current_price);
  if (price == null) return null;
  const pre = String(item.pre_price_text || "").trim();
  const post = String(item.post_price_text || "").trim();
  const priceText = String(item.price_text || "").trim();

  const offer = notAPrice(item, price, pre);
  if (offer) return { price: offer, unitPrice: null, unitBasis: null, factor: 1 };
  if (isAmountOff(pre) || /^off\b/i.test(post)) return amountOffPrice(item, price, pre, post);

  const multi = pre.match(/^(\d+)\s*(?:\/|for|pour)\s*$/i);
  const count = multi ? Number(multi[1]) : 1;
  const each = price / count;

  let unitPrice = round2(each);
  let unitBasis = "each";
  // Loblaw stores (Maxi, Provigo) mark weight-priced items with a _KG
  // print id; their flyers print that price per lb (Maxi's apples:
  // "99¢/LB", id 20914172001_KG).
  const byWeight = /_KG$/i.test(String(item.print_id || "")) ? "lb" : "";
  const unit =
    priceUnit(post) || priceUnit(priceText) || priceUnit(pre) || (multi ? "" : byWeight || unitFromItemText(item, each)) || "";
  const factor = { kg: LB_PER_KG, "100 g": 10 * LB_PER_KG, "100 mL": 10 }[unit] || 1;
  unitPrice = round2(each * factor);
  if (unit === "lb" || unit === "kg" || unit === "100 g") unitBasis = "lb";
  else if (unit === "L" || unit === "100 mL") unitBasis = "L";

  const printed = multi
    ? `${count}/${money(price)}`
    : `${money(price)}${unit ? `/${unit}` : ""}`;
  return { price: printed, unitPrice, unitBasis, factor };
}

// Tiles whose number isn't what the item costs:
//   - free with another purchase: "GRATUIT viandes cuisinées Maple Leaf ...
//     à l'achat de bacon Maple Leaf, Valeur de 8,49$" - the 8.49 is what
//     you'd save;
//   - "annoncé à" / "valeur de" bundles that only state a value;
//   - points offers whose number is the points' worth: Metro's "375 points
//     à l'achat d'un pâté au poulet, Valeur de 3$" comes through as a $3.00
//     pot pie. (Points on top of a real price - "Obtenez 2 000 pts" on an
//     $8.00 item - are fine: the number there is the price.)
// The label to show instead of a price, or null for a real price.
function notAPrice(item, price, pre) {
  const fold = (t) =>
    String(t || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  const story = fold(item.sale_story);
  const desc = fold(item.description);
  const name = fold(item.name);
  if (/^gratuit\b|^free\b/.test(name) || /^(?:gratuit|free)\b/.test(story) || /\bfree with (?:the )?purchase\b/.test(`${story} ${desc}`)) {
    return "Free with purchase";
  }
  const value = `${story} ${desc}`.match(/\b(?:valeur|valuer|value|worth)\s*(?:de|of)?\s*\$?\s*(\d+(?:[.,]\d{1,2})?)\s*\$?/);
  const worth = value ? Number(value[1].replace(",", ".")) : null;
  if (/^annonc|^announc/.test(fold(pre)) && worth != null) return `Worth ${money(worth)}`;
  if (/\bpoints?\b|\bpts\b/.test(story) && worth != null && Math.abs(worth - price) < 0.01) return "Points offer";
  return null;
}

// "rabais de" (and Super C's own "rebais de"), "save", "économisez",
// "épargnez" before the number: an amount off.
function isAmountOff(text) {
  return /^(?:save|rabais|rebais|[eé]conomisez|[eé]pargnez)\b/i.test(text.normalize("NFC"));
}

function amountOffPrice(item, amount, pre, post) {
  const percent = /%/.test(post) || /%/.test(String(item.price_text || ""));
  const regular = toNumber(item.original_price) ?? regularFromText(item);
  if (regular != null) {
    const sale = round2(percent ? regular * (1 - amount / 100) : regular - amount);
    if (sale > 0 && sale < regular) return { price: money(sale), unitPrice: sale, unitBasis: "each", factor: 1, regularPrice: regular };
  }
  return { price: percent ? `${amount}% off` : `${money(amount)} off`, unitPrice: null, unitBasis: null, factor: 1 };
}

// Flipp sometimes leaves the unit out of the price fields even though the
// flyer prices by weight: Maxi's "Pommes Cortland" come through as a bare
// 0.99 with "2,18/kg" and "prix rég.: 1,69$/lb" only in the description.
// The price is per lb when the item text gives the same price per kg
// (price ÷ 0.4536, give or take the flyer's rounding) or per lb, or when
// the regular price is per lb and nothing says the item is a sized pack.
function unitFromItemText(item, each) {
  const text = [item.description, item.sale_story, item.price_text, item.disclaimer_text]
    .filter((t) => typeof t === "string")
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!text.trim()) return null;
  const figures = (unitRe) =>
    [...text.matchAll(new RegExp(String.raw`\$?\s*(\d+(?:[.,]\d{1,2})?)\s*\$?\s*(?:\/|per |par |la |le )\s*(?:${unitRe})(?![a-z])`, "g"))].map((m) =>
      Number(m[1].replace(",", "."))
    );
  if (figures("kg").some((kg) => Math.abs(kg - each / LB_PER_KG) <= 0.02)) return "lb";
  if (figures("lbs?|livres?").some((lb) => Math.abs(lb - each) < 0.005)) return "lb";
  const regular = text.match(/(?<![a-z])(?:reg(?:ular|ulier)?\.?|prix reg(?:ulier)?\.?)\s*(?:price\s*)?:?\s*\$?\s*(\d+(?:[.,]\d{1,2})?)\s*\$?\s*\/\s*(?:lbs?|livres?)(?![a-z])/);
  const packed = PACK_RE.test(`${item.name || ""} ${item.description || ""}`);
  if (regular && !packed && Number(regular[1].replace(",", ".")) > each) return "lb";
  return null;
}

// The unit a price text is per, from the first unit it names: "/lb",
// "lb.", "per lb", "la lb", "/lb 2.18/kg" (the per-kg figure that follows
// is the same price) -> "lb"; "/kg", "/100 g", "L", "/100 mL" likewise.
// null for "ea", "each", "ch." or no unit - a price per item.
function priceUnit(text) {
  const t = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const m = t.match(/(?:^|[\s/])(?:(?:per|par|la|le|the)\s+)?(100\s*g|100\s*ml|kg|lbs?|livres?|l|litres?|liters?)(?![a-z0-9'’])/);
  if (!m) return null;
  const u = m[1].replace(/\s+/g, "");
  if (u === "100g") return "100 g";
  if (u === "100ml") return "100 mL";
  if (u === "kg") return "kg";
  if (/^(lbs?|livres?)$/.test(u)) return "lb";
  return "L";
}

// "12/341-355 ml" (a case of 12, cans of 341 to 355 mL) is one size: read
// without its range it was "355 ml", and a $36.99 case of beer $104/L.
const SIZE_RE = /\b\d+(?:[.,]\d+)?\s*(?:[x×/]\s*\d+(?:[.,]\d+)?\s*)?(?:(?:-|–|à|to)\s*\d+(?:[.,]\d+)?\s*)?(?:kg|g|mg|l|ml|lb|lbs|oz|pk|pack|un|ct)\b\.?/gi;

// A plain ingredient name to match against recipes: lowercase, no package
// size, no "or"-alternatives, no brand-ish trailing detail after a comma.
// A bilingual name ("pommes Cortland | apples") is matched by its English
// half - unless that half doesn't name the product ("ESCALOPE DE POULET |
// AIR CHILLED, UP TO 590 G"), then by the French one. A list of varieties
// before the product ("McIntosh, Spartan, Lobo or Cortland apples") is
// matched by the product at its end.
export function toMatchName(name) {
  const { en, fr } = splitBilingual(name);
  const fromEnglish = pickName(en);
  if (fr && !namesFood(fromEnglish)) {
    const fromFrench = pickName(fr);
    const translated = frenchToEnglish(fromFrench);
    if (namesFood(translated)) return translated;
  }
  // A French-only name ("BŒUF HACHÉ MAIGRE") is matched in English.
  if (!fr && looksFrench(fromEnglish)) return frenchToEnglish(fromEnglish) || fromEnglish;
  return fromEnglish;
}

// Proteins that name a kind of something else in "beef or chicken pie".
const KIND_WORDS = new Set("beef chicken pork turkey veal lamb fish salmon tuna shrimp cheese vegetable veggie boeuf poulet porc dinde veau agneau".split(" "));

function pickName(text) {
  const parts = String(text || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(SIZE_RE, " ")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const lastPart = parts[parts.length - 1] || "";
  const lastChoice = lastPart.split(/ (?:or|ou) /i).pop().trim();
  // "HOTHOUSE GRAPE, CHERRY OR MIXED TOMATOES": short names, then a last
  // choice that's a whole product name.
  const varieties =
    parts.length > 1 && / (?:or|ou) /i.test(lastPart) && /\s/.test(lastChoice) && parts.slice(0, -1).every((p) => p.split(/\s+/).length <= 2);
  const head = varieties ? lastPart : parts[0] || "";
  const clean = head
    // "chicken tournedos with bacon" is chicken tournedos.
    .split(/\s(?:with|avec)\s/i)[0]
    .replace(/[®™*]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[\s\-–,;:]+$/, "")
    .trim()
    .toLowerCase();
  const choices = clean.split(/ or | ou /).map((c) => c.trim());
  if (choices.length === 1) return clean;
  const first = choices[0];
  const last = choices[choices.length - 1];
  const firstWords = first.split(" ");
  const lastNoun = last.split(" ").pop();
  // "Beef or Chicken Pie": the first choice is only the kind of pie.
  if (KIND_WORDS.has(firstWords[firstWords.length - 1]) && !KIND_WORDS.has(lastNoun) && last.split(" ").length > 1 && endsOnFood(last)) {
    return `${first} ${lastNoun}`;
  }
  // "Red or Green Peppers", "Old Fashioned or Black Forest Smoked Ham": a
  // first choice that doesn't end on a food is only a describing word, so
  // the product comes from the last choice; "Pork Loin Chops or Roast"
  // keeps the first.
  if (firstWords.length === 1 || (!endsOnFood(first) && endsOnFood(last))) return last;
  return first;
}

const CATEGORY_WORDS = [
  ["protein", /\b(chicken|poulet|beef|b(?:oe|œ)uf|pork|porc|ham|jambon|bacon|sausage|saucisse|turkey|dinde|lamb|agneau|veal|veau|salmon|saumon|tuna|thon|shrimp|crevette|cod|morue|tilapia|fish|poisson|steak|roast|rôti|ground|haché|tofu|eggs?|oeufs?|œufs?)\b/i],
  ["dairy", /\b(milk|lait|cheese|fromage|yogh?urt|yogourt|butter|beurre|cream|crème|creme|cottage|kefir)\b/i],
  ["bakery", /\b(bread|pain|bagels?|baguette|buns?|croissants?|muffins?|tortillas?|pita|naan|cake|gâteau)\b/i],
  ["produce", /\b(apples?|pommes?|bananas?|bananes?|oranges?|lemons?|citrons?|limes?|grapes?|raisins?|berries|fraises?|strawberr(?:y|ies)|blueberr(?:y|ies)|bleuets?|melons?|pears?|poires?|peaches|pêches|avocados?|avocats?|tomato(?:es)?|tomates?|potato(?:es)?|patates?|pommes de terre|onions?|oignons?|carrots?|carottes?|lettuce|laitue|spinach|épinards|broccoli|brocoli|cauliflower|chou-fleur|peppers?|poivrons?|cucumbers?|concombres?|mushrooms?|champignons?|celery|céleri|zucchini|courgettes?|squash|courge|cabbage|chou|kale|garlic|ail|corn|maïs|asparagus|asperges|herbs?|cilantro|coriandre|parsley|persil|mangoes?|mangues?|pineapples?|ananas|cherr(?:y|ies)|cerises?|kiwis?|plums?|prunes?)\b/i],
  ["staple", /\b(rice|riz|pasta|pâtes|noodles?|nouilles|flour|farine|sugar|sucre|oil|huile|vinegar|vinaigre|beans|haricots|lentils|lentilles|chickpeas|pois chiches|cereal|céréales|oats|avoine|sauce|soup|soupe|broth|bouillon|coffee|café|tea|thé|canned|conserve|spices?|épices?|salt|sel|honey|miel|syrup|sirop|peanut|nuts?|noix)\b/i],
];

export function categorize(name) {
  // Ground coffee isn't ground meat.
  if (/\b(coffee|caf[ée]|espresso|k-cups?)\b/i.test(name)) return "staple";
  for (const [category, re] of CATEGORY_WORDS) if (re.test(name)) return category;
  return "other";
}

function isoDate(value) {
  if (!value) return null;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// The item's own product photo. Flipp names it differently depending on
// the endpoint: a cutout (just the product) is best, then a cleaned-up
// crop, then the raw crop of the flyer page.
const IMAGE_FIELDS = ["cutout_image_url", "clean_image_url", "x_large_image_url", "large_image_url", "image_url", "clipping_image_url"];
export function flippImage(item) {
  for (const field of IMAGE_FIELDS) {
    const url = item[field];
    if (typeof url === "string" && /^https?:\/\//i.test(url.trim())) return url.trim().replace(/^http:/i, "https:");
    if (typeof url === "string" && url.startsWith("//")) return `https:${url}`;
  }
  return null;
}

// The usual price the flyer states for an item, in the same unit as the
// deal's unitPrice - from its "SAVE $2.00" / "SAVE 25%" / "REG. $6.99"
// text (Flipp puts it in sale_story, sometimes in the price texts or the
// description). null when it doesn't say, says "up to", or the numbers
// don't make sense (a "regular" price under the sale price).
export function regularPriceFor(item, priced) {
  if (!priced || priced.unitPrice == null) return null;
  if (priced.regularPrice != null) return priced.regularPrice;
  const sane = (r) => (r > priced.unitPrice && r <= priced.unitPrice * 5 ? Math.round(r * 100) / 100 : null);
  // The item page states it outright: original_price, or the dollars or
  // percent off (not when it's only "up to" that much).
  const factor = priced.factor || 1;
  const upTo = /\bup to\b|\bjusqu/i.test(`${item.sale_story || ""} ${item.price_text || ""}`);
  const original = toNumber(item.original_price);
  const perKg = originalIsPerKg(item, priced, original);
  if (perKg != null) {
    // Its dollars and percent off were worked out from the same per-kg
    // number, so they're no better.
    return sane(original * LB_PER_KG);
  }
  if (original != null && sane(original * factor)) return sane(original * factor);
  const dollarsOff = Number(item.dollars_off);
  if (!upTo && dollarsOff > 0 && sane(priced.unitPrice + dollarsOff * factor)) return sane(priced.unitPrice + dollarsOff * factor);
  const percentOff = Number(item.percent_off);
  if (!upTo && percentOff > 0 && percentOff < 90) {
    const r = sane(priced.unitPrice / (1 - percentOff / 100));
    if (r) return r;
  }
  return regularFromText(item, priced);
}

// IGA and Metro print a per-lb sale price but the regular price per kg:
// "$11.99/lb ... Rég. 30,19$/kg" is $13.69/lb regular, not $30.19 (which
// read as 60% off). The unit right after the regular price ("/kg", or a
// range's "7,97 à 16,59/kg") converts it to the deal's per-lb basis.
function regularUnitFactor(after, priced) {
  if (priced?.unitBasis !== "lb") return 1;
  const m = String(after)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/^\s*(?:(?:a|to|-)\s*\$?\s*\d+(?:[.,]\d{1,2})?\s*\$?\s*)?(?:\/|per |par |le |la )\s*(kg|lbs?|100\s*g)\b/i);
  if (!m) return 1;
  const unit = m[1].toLowerCase().replace(/\s+/g, "");
  if (unit === "kg") return LB_PER_KG;
  if (unit === "100g") return 10 * LB_PER_KG;
  return 1;
}

// Flipp's own original_price is sometimes the per-kg regular price next
// to a per-lb sale. Metro's chicken legs: "$3.99/lb - 8,80$/kg" with
// original_price 9.99 (and "60% off") while the flyer prints "reg.
// 4,99/lb - 11,00/kg". When the item's text gives the sale per kg (8.80),
// doesn't give the original per kg as a per-lb price would (9.99/lb is
// 22.02/kg), and the original sits just above the per-kg sale price, the
// original is per kg. Returns true then, else null.
function originalIsPerKg(item, priced, original) {
  if (original == null || priced?.unitBasis !== "lb" || (priced.factor || 1) !== 1) return null;
  const text = [item.price_text, item.post_price_text, item.description, item.sale_story, item.disclaimer_text]
    .filter((t) => typeof t === "string")
    .join(" ");
  const kgFigures = [...text.matchAll(/(\d+(?:[.,]\d{1,2})?)\s*\$?\s*\/\s*kg\b/gi)].map((m) => Number(m[1].replace(",", ".")));
  if (kgFigures.length === 0) return null;
  const saleKg = priced.unitPrice / LB_PER_KG;
  const near = (a, b) => Math.abs(a - b) <= 0.03;
  if (!kgFigures.some((k) => near(k, saleKg))) return null;
  if (kgFigures.some((k) => near(k, original / LB_PER_KG))) return null;
  return original > saleKg && original < saleKg * 1.8 ? true : null;
}

// The usual price from the item's own words ("REG. $6.99", "SAVE $2.00",
// "économisez 25%"), in the deal's unit when given a priced deal; null
// when it doesn't say or the numbers don't add up.
function regularFromText(item, priced = null) {
  const text = [item.sale_story, item.price_text, item.pre_price_text, item.post_price_text, item.description, item.disclaimer_text]
    .filter((t) => typeof t === "string" && t.trim())
    .join(" ")
    .replace(/\s+/g, " ");
  if (!text || /\bup to\b|\bjusqu/i.test(text)) return null;
  const amount = (s) => Number(s.replace(",", "."));
  let regular = null;
  let m;
  if ((m = text.match(/(?<![\p{L}])(?:reg(?:ular)?\.?(?: price)?|r[eé]g(?:ulier)?\.?|prix r[eé]gulier)\s*:?\s*(?:de\s*)?\$?\s*(\d+(?:[.,]\d{1,2})?)\s*\$?/iu))) {
    regular = amount(m[1]) * regularUnitFactor(text.slice(m.index + m[0].length, m.index + m[0].length + 24), priced);
  } else if ((m = text.match(/(?<![\p{L}])(?:save|[eé]conomisez)\s*\$\s*(\d+(?:[.,]\d{1,2})?)/iu)) || (m = text.match(/(?<![\p{L}])(?:save|[eé]conomisez)\s*(\d+(?:[.,]\d{1,2})?)\s*\$/iu))) {
    if (!priced) return null;
    regular = priced.unitPrice + amount(m[1]);
  } else if ((m = text.match(/(?<![\p{L}])(?:save|[eé]conomisez)\s*(\d{1,2})\s*%/iu))) {
    if (!priced) return null;
    regular = priced.unitPrice / (1 - Number(m[1]) / 100);
  }
  if (!priced) return regular > 0 ? Math.round(regular * 100) / 100 : null;
  if (!(regular > priced.unitPrice) || regular > priced.unitPrice * 5) return null;
  return Math.round(regular * 100) / 100;
}

// One Flipp flyer item -> the app's FlyerDeal shape, or null for the
// banners, section headers and unpriced "save 30%" tiles a flyer also
// carries.
// Flipp often prints the pack size only in the description ("McIntosh
// Apples" / "3 lb bag"); it goes on the name, so a $5.99 bag is compared
// per lb ($2.00/lb) rather than as $5.99 against 99¢/lb apples.
const PACK_RE = new RegExp(SIZE_RE.source, "i"); // SIZE_RE is global (stateful .test)
function withPackSize(name, item) {
  if (PACK_RE.test(name)) return name;
  const desc = [item.description, item.sale_story].filter((t) => typeof t === "string").join(" ");
  const size = desc.match(PACK_RE);
  if (!size) return name;
  // "3 lb bag" or "sac de 3 lb"
  const around = desc.slice(Math.max(0, size.index - 8), size.index + size[0].length + 6);
  const bag = /\b(bag|sac)\b/i.test(around) ? " bag" : "";
  return `${name}, ${size[0].trim()}${bag}`;
}

export function normalizeFlippItem(item, flyer) {
  const name = withPackSize(String(item.name || item.display_name || "").trim().replace(/[\s,;]+$/, ""), item);
  if (!name || name.length > 200) return null;
  const priced = flippPriceParts(item);
  if (!priced) return null;
  const matchName = toMatchName(name) || name.toLowerCase();
  return {
    store: flyer.merchant,
    item: name,
    matchName,
    price: priced.price,
    unitPrice: priced.unitPrice,
    unitBasis: priced.unitBasis,
    category: categorize(`${name} ${item.category || ""}`),
    validUntil: isoDate(item.valid_to ?? flyer.validTo),
    regularPrice: regularPriceFor(item, priced),
    imageUrl: flippImage(item),
  };
}

// Every priced item from the given stores' current grocery flyers near a
// postal code. `stores` empty = every grocery flyer Flipp lists there.
// Items repeated across a flyer's pages are kept once.
export async function fetchFlippDeals({ postalCode, stores = [], fetchImpl = fetch, concurrency = 3 }) {
  const flyers = (await fetchFlyers(postalCode, { fetchImpl })).filter(isGroceryFlyer);
  const wanted = stores.length ? flyers.filter((f) => stores.some((s) => merchantMatches(f.merchant, s))) : flyers;

  // Name each deal after the store as the user wrote it ("Super C"), so
  // prices line up with the same store's history from other sources.
  const storeFor = (merchant) => stores.find((s) => merchantMatches(merchant, s)) || merchant;

  const perFlyer = wanted.map(() => []); // kept in flyer order
  const failed = [];
  const queue = wanted.map((flyer, i) => ({ flyer, i }));
  const lookups = { tried: 0, found: 0 };
  async function worker() {
    while (queue.length) {
      const { flyer, i } = queue.shift();
      try {
        const items = await fetchFlyerItems(flyer.id, { fetchImpl });
        const detailed = await withItemDetails(items, fetchImpl, lookups);
        const named = { ...flyer, merchant: storeFor(flyer.merchant) };
        for (const item of detailed) {
          const deal = normalizeFlippItem(item, named);
          if (deal) perFlyer[i].push(deal);
        }
      } catch (err) {
        failed.push(`${flyer.merchant}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, wanted.length) }, worker));
  const deals = perFlyer.flat();

  const seen = new Set();
  const unique = deals.filter((d) => {
    const key = `${d.store}|${d.item.toLowerCase()}|${d.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    deals: unique,
    flyers: wanted.map((f) => ({ merchant: storeFor(f.merchant), validTo: isoDate(f.validTo) })),
    failed,
  };
}

// A flyer's item list carries little more than the name and the bare
// price: the unit ("/lb", "le 100 g"), "2/" multi-buys, "rabais de"
// amounts off, the description with the pack size ("sac 4 lb"), the
// regular price and often the photo are only on each item's own page.
// So every item with a price (or an amount off) is looked up there - about
// 30 ms each, 8 at a time - and its fields fill in what the list left
// out. Given up on if the first lookups all fail (the endpoint moved); the
// list's own fields are used as they are then.
const MAX_DETAIL_LOOKUPS = 3000;
const DETAIL_FIELDS = [
  "description",
  "pre_price_text",
  "price_text",
  "post_price_text",
  "sale_story",
  "disclaimer_text",
  "current_price",
  "original_price",
  "dollars_off",
  "percent_off",
  ...IMAGE_FIELDS,
];
async function withItemDetails(items, fetchImpl, lookups) {
  const wanted = items.filter((i) => i.id != null && (toNumber(i.price) != null || i.discount != null));
  const details = new Map();
  const queue = [...wanted];
  async function worker() {
    while (queue.length) {
      if (lookups.tried >= MAX_DETAIL_LOOKUPS || (lookups.tried >= 10 && lookups.found === 0)) return;
      const item = queue.shift();
      lookups.tried++;
      try {
        const data = await getJson(`${flippBase()}/items/${encodeURIComponent(item.id)}?locale=${LOCALE}`, fetchImpl);
        const detail = data?.item ?? data;
        if (detail && typeof detail === "object") {
          details.set(item, detail);
          lookups.found++;
        }
      } catch {
        // The list's own fields will do for this one.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, queue.length) }, worker));
  return items.map((item) => {
    const detail = details.get(item);
    if (!detail) return item;
    const merged = { ...item };
    for (const field of DETAIL_FIELDS) {
      const value = detail[field];
      if (value != null && value !== "" && (merged[field] == null || merged[field] === "")) merged[field] = value;
    }
    return merged;
  });
}

// Which grocery stores have a flyer near this postal code right now - for
// the store picker.
export async function listFlippStores(postalCode, { fetchImpl = fetch } = {}) {
  const flyers = (await fetchFlyers(postalCode, { fetchImpl })).filter(isGroceryFlyer);
  return [...new Set(flyers.map((f) => f.merchant))].sort((a, b) => a.localeCompare(b));
}
