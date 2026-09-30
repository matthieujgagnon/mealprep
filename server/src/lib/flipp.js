// Reads grocery flyers from Flipp (flipp.com), the service most Canadian
// grocers publish their weekly flyers through. Flipp has no official public
// API; this uses the same keyless JSON its own web app loads
// (backflipp.wishabi.com). It isn't documented and can change without
// notice, so everything here reads fields defensively - a missing or
// renamed field drops that one item rather than failing the whole import.

// FLIPP_BASE_URL overrides it (the e2e tests point it somewhere unreachable).
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

// Flipp splits a printed price into pre_price_text ("2/", "2 for"), price
// ("5.00") and post_price_text ("/lb", "lb", "/kg", "/100 g", "ea"). This
// rebuilds the printed text and reduces it to one comparable number in the
// app's own bases: per lb for weight, per L for volume, else each.
export function parseFlippPrice(item) {
  const price = toNumber(item.price ?? item.current_price);
  if (price == null) return null;
  const pre = String(item.pre_price_text || "").trim();
  const post = String(item.post_price_text || "").trim();

  const multi = pre.match(/^(\d+)\s*(?:\/|for|pour)\s*$/i);
  const count = multi ? Number(multi[1]) : 1;
  const each = price / count;

  let unitPrice = round2(each);
  let unitBasis = "each";
  const unit = post.toLowerCase().replace(/^\//, "").replace(/\s+/g, " ").trim();
  if (/^(lb|lbs|livre|lb\.)$/.test(unit)) {
    unitBasis = "lb";
  } else if (/^kg$/.test(unit)) {
    unitPrice = round2(each * LB_PER_KG);
    unitBasis = "lb";
  } else if (/^100 ?g$/.test(unit)) {
    unitPrice = round2(each * 10 * LB_PER_KG);
    unitBasis = "lb";
  } else if (/^(l|litre|liter)$/.test(unit)) {
    unitBasis = "L";
  } else if (/^100 ?ml$/.test(unit)) {
    unitPrice = round2(each * 10);
    unitBasis = "L";
  }

  const printed = multi
    ? `${count}/${money(price)}`
    : `${money(price)}${unitBasis === "each" || !post ? "" : `/${unit.replace(/^100 ?g$/, "100 g")}`}`;
  return { price: printed, unitPrice, unitBasis };
}

const SIZE_RE = /\b\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(?:kg|g|mg|l|ml|lb|lbs|oz|pk|pack|un|ct)\b\.?/gi;

// A plain ingredient name to match against recipes: lowercase, no package
// size, no "or"-alternatives, no brand-ish trailing detail after a comma.
export function toMatchName(name) {
  const clean = String(name || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(SIZE_RE, " ")
    .split(",")[0]
    .replace(/[®™*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  // "Red or Green Peppers": a one-word first choice is only an adjective,
  // so the noun comes from the last choice; "Pork Chops or Roast" keeps
  // the first.
  const choices = clean.split(/ or | ou /);
  if (choices.length === 1) return clean;
  const first = choices[0].trim();
  const last = choices[choices.length - 1].trim();
  return first.split(" ").length === 1 ? last : first;
}

const CATEGORY_WORDS = [
  ["protein", /\b(chicken|poulet|beef|b(?:oe|œ)uf|pork|porc|ham|jambon|bacon|sausage|saucisse|turkey|dinde|lamb|agneau|veal|veau|salmon|saumon|tuna|thon|shrimp|crevette|cod|morue|tilapia|fish|poisson|steak|roast|rôti|ground|haché|tofu|eggs?|oeufs?|œufs?)\b/i],
  ["dairy", /\b(milk|lait|cheese|fromage|yogh?urt|yogourt|butter|beurre|cream|crème|creme|cottage|kefir)\b/i],
  ["bakery", /\b(bread|pain|bagels?|baguette|buns?|croissants?|muffins?|tortillas?|pita|naan|cake|gâteau)\b/i],
  ["produce", /\b(apples?|pommes?|bananas?|bananes?|oranges?|lemons?|citrons?|limes?|grapes?|raisins?|berries|fraises?|strawberr(?:y|ies)|blueberr(?:y|ies)|bleuets?|melons?|pears?|poires?|peaches|pêches|avocados?|avocats?|tomato(?:es)?|tomates?|potato(?:es)?|patates?|pommes de terre|onions?|oignons?|carrots?|carottes?|lettuce|laitue|spinach|épinards|broccoli|brocoli|cauliflower|chou-fleur|peppers?|poivrons?|cucumbers?|concombres?|mushrooms?|champignons?|celery|céleri|zucchini|courgettes?|squash|courge|cabbage|chou|kale|garlic|ail|corn|maïs|asparagus|asperges|herbs?|cilantro|coriandre|parsley|persil|mangoes?|mangues?|pineapples?|ananas|cherr(?:y|ies)|cerises?|kiwis?|plums?|prunes?)\b/i],
  ["staple", /\b(rice|riz|pasta|pâtes|noodles?|nouilles|flour|farine|sugar|sucre|oil|huile|vinegar|vinaigre|beans|haricots|lentils|lentilles|chickpeas|pois chiches|cereal|céréales|oats|avoine|sauce|soup|soupe|broth|bouillon|coffee|café|tea|thé|canned|conserve|spices?|épices?|salt|sel|honey|miel|syrup|sirop|peanut|nuts?|noix)\b/i],
];

export function categorize(name) {
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

// One Flipp flyer item -> the app's FlyerDeal shape, or null for the
// banners, section headers and unpriced "save 30%" tiles a flyer also
// carries.
export function normalizeFlippItem(item, flyer) {
  const name = String(item.name || item.display_name || "").trim();
  if (!name || name.length > 200) return null;
  const priced = parseFlippPrice(item);
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

  const deals = [];
  const failed = [];
  const queue = [...wanted];
  async function worker() {
    while (queue.length) {
      const flyer = queue.shift();
      try {
        const items = await fetchFlyerItems(flyer.id, { fetchImpl });
        const named = { ...flyer, merchant: storeFor(flyer.merchant) };
        for (const item of items) {
          const deal = normalizeFlippItem(item, named);
          if (deal) deals.push(deal);
        }
      } catch (err) {
        failed.push(`${flyer.merchant}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, wanted.length) }, worker));

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

// Which grocery stores have a flyer near this postal code right now - for
// the store picker.
export async function listFlippStores(postalCode, { fetchImpl = fetch } = {}) {
  const flyers = (await fetchFlyers(postalCode, { fetchImpl })).filter(isGroceryFlyer);
  return [...new Set(flyers.map((f) => f.merchant))].sort((a, b) => a.localeCompare(b));
}
