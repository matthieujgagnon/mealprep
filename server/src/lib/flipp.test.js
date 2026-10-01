import { describe, expect, it } from "vitest";
import {
  categorize,
  fetchFlippDeals,
  merchantMatches,
  normalizeFlippItem,
  parseFlippPrice,
  readFlyerItems,
  readFlyerList,
  regularPriceFor,
  toMatchName,
} from "./flipp.js";

// Shaped like Flipp's own responses (flyer list, then a flyer's items),
// including the banner and unpriced tiles a real flyer carries.
const FLYERS = {
  flyers: [
    { id: 101, merchant: "Metro", merchant_id: 1, valid_from: "2026-09-24T00:00:00-04:00", valid_to: "2026-09-30T23:59:59-04:00", categories: ["Groceries"] },
    { id: 102, merchant: "Super C", valid_to: "2026-09-30T23:59:59-04:00", categories: "Groceries, Pharmacy" },
    { id: 103, merchant: "Canadian Tire", categories: ["Hardware", "Home"] },
    { id: 104, merchant: "IGA", categories: [] },
  ],
};
const ITEMS = {
  101: {
    items: [
      { id: 1, name: "Boneless Skinless Chicken Breasts", price: "4.49", post_price_text: "/lb", cutout_image_url: "https://f.wishabi.net/c1.jpg", valid_to: "2026-09-30T23:59:59-04:00" },
      { id: 2, name: "Barilla Pasta, 900 g", pre_price_text: "2/", price: "5.00" },
      { id: 3, name: "Save on back to school", price: "" },
      { id: 4, name: "Atlantic Salmon Fillets", price: "19.82", post_price_text: "/kg" },
      { id: 1, name: "Boneless Skinless Chicken Breasts", price: "4.49", post_price_text: "/lb" },
    ],
  },
  102: [{ name: "Milk 2%, 4 L", price: "6.29", clean_image_url: "https://f.wishabi.net/m.jpg" }],
};

function fakeFetch(url) {
  const u = new URL(url);
  let body;
  if (u.pathname.endsWith("/flipp/flyers")) body = FLYERS;
  else body = ITEMS[u.pathname.split("/").pop()] ?? { items: [] };
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

describe("Flipp responses", () => {
  it("reads the flyer list in either shape", () => {
    expect(readFlyerList(FLYERS).map((f) => f.merchant)).toEqual(["Metro", "Super C", "Canadian Tire", "IGA"]);
    expect(readFlyerList(FLYERS.flyers)).toHaveLength(4);
    expect(readFlyerList(null)).toEqual([]);
    expect(readFlyerList(FLYERS)[1].categories).toEqual(["Groceries", "Pharmacy"]);
  });

  it("reads items under items, flyer_items or a bare array", () => {
    expect(readFlyerItems({ items: [1] })).toEqual([1]);
    expect(readFlyerItems({ flyer_items: [1, 2] })).toEqual([1, 2]);
    expect(readFlyerItems([3])).toEqual([3]);
    expect(readFlyerItems({})).toEqual([]);
  });
});

describe("parseFlippPrice", () => {
  it("keeps per-lb prices per lb", () => {
    expect(parseFlippPrice({ price: "4.49", post_price_text: "/lb" })).toEqual({ price: "$4.49/lb", unitPrice: 4.49, unitBasis: "lb" });
  });

  it("converts per-kg and per-100 g to per lb", () => {
    expect(parseFlippPrice({ price: "9.90", post_price_text: "/kg" })).toEqual({ price: "$9.90/kg", unitPrice: 4.49, unitBasis: "lb" });
    expect(parseFlippPrice({ price: "1.29", post_price_text: "/100 g" })).toEqual({ price: "$1.29/100 g", unitPrice: 5.85, unitBasis: "lb" });
  });

  it("reduces a multi-buy to one each price", () => {
    expect(parseFlippPrice({ pre_price_text: "2/", price: "7.00" })).toEqual({ price: "2/$7.00", unitPrice: 3.5, unitBasis: "each" });
    expect(parseFlippPrice({ pre_price_text: "3 for", price: "10" })).toEqual({ price: "3/$10.00", unitPrice: 3.33, unitBasis: "each" });
  });

  it("reads per-litre and each prices, and rejects unpriced tiles", () => {
    expect(parseFlippPrice({ price: "2.49", post_price_text: "L" })).toMatchObject({ unitPrice: 2.49, unitBasis: "L" });
    expect(parseFlippPrice({ current_price: 3.99 })).toEqual({ price: "$3.99", unitPrice: 3.99, unitBasis: "each" });
    expect(parseFlippPrice({ price: "", sale_story: "Save 30%" })).toBe(null);
    expect(parseFlippPrice({ price: "0" })).toBe(null);
  });

  it("finds the unit however the flyer words it", () => {
    // A per-lb price with its per-kg figure after it is per lb, not each.
    expect(parseFlippPrice({ price: "0.99", post_price_text: "/lb 2.18/kg" })).toEqual({ price: "$0.99/lb", unitPrice: 0.99, unitBasis: "lb" });
    expect(parseFlippPrice({ price: "0.99", post_price_text: "lb." })).toMatchObject({ unitBasis: "lb" });
    expect(parseFlippPrice({ price: "0.99", post_price_text: "per lb" })).toMatchObject({ unitBasis: "lb" });
    expect(parseFlippPrice({ price: "0.99", post_price_text: "la lb" })).toMatchObject({ unitBasis: "lb" });
    expect(parseFlippPrice({ price: "2.18", post_price_text: "/ kg" })).toMatchObject({ unitPrice: 0.99, unitBasis: "lb" });
    expect(parseFlippPrice({ price: "5.99", post_price_text: "ea." })).toEqual({ price: "$5.99", unitPrice: 5.99, unitBasis: "each" });
    expect(parseFlippPrice({ price: "5.99", post_price_text: "ch." })).toMatchObject({ unitBasis: "each" });
    expect(parseFlippPrice({ price: "4.99", post_price_text: "avec carte" })).toMatchObject({ unitBasis: "each" });
  });

  it("puts a pack size from the description on the name", () => {
    const bag = normalizeFlippItem({ name: "McIntosh Apples", price: "5.99", description: "3 lb bag, product of Quebec" }, { merchant: "Metro" });
    expect(bag.item).toBe("McIntosh Apples, 3 lb bag");
    expect(bag.unitBasis).toBe("each");
    const loose = normalizeFlippItem({ name: "McIntosh Apples", price: "0.99", post_price_text: "/lb 2.18/kg" }, { merchant: "Super C" });
    expect(loose).toMatchObject({ item: "McIntosh Apples", unitPrice: 0.99, unitBasis: "lb" });
    // Already sized: left alone.
    expect(normalizeFlippItem({ name: "Butter 454 g", price: "4.99", description: "1 lb" }, { merchant: "Metro" }).item).toBe("Butter 454 g");
  });

  it("reads a per-lb price from the description when the price fields have no unit", () => {
    // Maxi's Cortland apples: a bare 0.99, the weight only in the description.
    const maxi = { name: "Pommes Cortland", price: "0.99", description: "Produit du Québec, cat. Extra. 2,18/kg. Prix rég.: 1,69$/lb-3,73$/kg" };
    expect(parseFlippPrice(maxi)).toEqual({ price: "$0.99/lb", unitPrice: 0.99, unitBasis: "lb" });
    expect(normalizeFlippItem(maxi, { merchant: "Maxi" })).toMatchObject({ unitPrice: 0.99, unitBasis: "lb", regularPrice: 1.69 });
    // The per-kg figure alone, or the same price per lb, is enough.
    expect(parseFlippPrice({ price: "0.99", sale_story: "$2.18/kg" })).toMatchObject({ unitBasis: "lb" });
    expect(parseFlippPrice({ price: "1.99", description: "1,99 $/lb" })).toMatchObject({ unitBasis: "lb" });
    // A regular price per lb with no pack size: still per lb.
    expect(parseFlippPrice({ price: "0.99", description: "Reg. 1.69/lb" })).toMatchObject({ unitBasis: "lb" });
    // A bag whose text quotes a per-lb regular price stays each.
    expect(parseFlippPrice({ name: "Apples", price: "5.99", description: "3 lb bag. Reg. 2.49/lb" })).toMatchObject({ unitBasis: "each" });
    // A per-kg figure that isn't this price says nothing about it.
    expect(parseFlippPrice({ price: "5.99", description: "Ground beef 8.80/kg" })).toMatchObject({ unitBasis: "each" });
    // Multi-buys are each.
    expect(parseFlippPrice({ price: "5", pre_price_text: "2/", description: "2,18/kg" })).toMatchObject({ unitBasis: "each" });
  });

  it("names a French bag size", () => {
    const sac = normalizeFlippItem({ name: "Pommes Honeycrisp", price: "5.99", description: "Sac de 3 lb" }, { merchant: "Super C" });
    expect(sac).toMatchObject({ item: "Pommes Honeycrisp, 3 lb bag", unitBasis: "each" });
  });
});

describe("names and categories", () => {
  it("strips sizes, alternatives and trailing detail for matching", () => {
    expect(toMatchName("Barilla Pasta, 900 g")).toBe("barilla pasta");
    expect(toMatchName("Red or Green Peppers")).toBe("green peppers");
    expect(toMatchName("Pork Loin Chops or Roast")).toBe("pork loin chops");
    expect(toMatchName("Lean Ground Beef (Family Pack) 1.5 kg")).toBe("lean ground beef");
  });

  it("matches by the English name: the English half, the product after a variety list, French-only names translated", () => {
    expect(toMatchName("pommes Cortland, McIntosh, Lobo | apples, 4 lb bag")).toBe("apples");
    expect(toMatchName("POMMES MCINTOSH, SPARTAN, LOBO OU CORTLAND | MCINTOSH, SPARTAN, LOBO OR CORTLAND APPLES")).toBe("cortland apples");
    expect(toMatchName("CORTLAND, MCINTOSH OR SPARTAN APPLES")).toBe("spartan apples");
    expect(toMatchName("ANANAS, PRODUIT DU COSTA RICA OU CANTALOUP | PINEAPPLE, PRODUCT OF COSTA RICA OR CANTALOUPE")).toBe("pineapple");
    expect(toMatchName("POMMES CORTLAND OU MCINTOSH")).toBe("apples");
    expect(toMatchName("BŒUF HACHÉ MAIGRE")).toBe("lean ground beef");
    expect(toMatchName("POITRINES DE POULET EXCELDOR, 2 UN.")).toBe("chicken breasts");
    expect(toMatchName("HAUTS DE CUISSES DE POULET FRAIS DÉSOSSÉS")).toBe("fresh boneless chicken thighs");
    expect(toMatchName("CRÈME GLACÉE PREMIUM OU YOGOURT GLACÉ CHAPMAN'S, 2 L")).toBe("ice cream");
    expect(toMatchName("KRAFT PEANUT BUTTER, 2 kg")).toBe("kraft peanut butter");
  });

  it("sorts items into the app's categories, French or English", () => {
    expect(categorize("Boneless Chicken Breasts")).toBe("protein");
    expect(categorize("Poitrine de poulet")).toBe("protein");
    expect(categorize("Greek Yogurt")).toBe("dairy");
    expect(categorize("Hass Avocados")).toBe("produce");
    expect(categorize("Basmati Rice")).toBe("staple");
    expect(categorize("Dish soap")).toBe("other");
  });

  it("matches store names without matching inside other words", () => {
    expect(merchantMatches("Super C", "super c")).toBe(true);
    expect(merchantMatches("IGA extra", "IGA")).toBe(true);
    expect(merchantMatches("BIGAR", "IGA")).toBe(false);
  });
});

describe("normalizeFlippItem", () => {
  it("builds a FlyerDeal from an item and its flyer", () => {
    const flyer = { merchant: "Metro", validTo: "2026-09-30T23:59:59-04:00" };
    expect(normalizeFlippItem(ITEMS[101].items[0], flyer)).toEqual({
      store: "Metro",
      item: "Boneless Skinless Chicken Breasts",
      matchName: "boneless skinless chicken breasts",
      price: "$4.49/lb",
      unitPrice: 4.49,
      unitBasis: "lb",
      category: "protein",
      validUntil: "2026-09-30",
      regularPrice: null,
      imageUrl: "https://f.wishabi.net/c1.jpg",
    });
    expect(normalizeFlippItem({ name: "", price: "1" }, flyer)).toBe(null);
  });
});

describe("fetchFlippDeals", () => {
  it("imports the chosen grocery stores' priced items once each", async () => {
    const result = await fetchFlippDeals({ postalCode: "h2t 2s3", stores: ["Metro", "Super C", "Canadian Tire"], fetchImpl: fakeFetch });
    expect(result.flyers.map((f) => f.merchant)).toEqual(["Metro", "Super C"]);
    expect(result.failed).toEqual([]);
    expect(result.deals.map((d) => [d.store, d.item, d.price])).toEqual([
      ["Metro", "Boneless Skinless Chicken Breasts", "$4.49/lb"],
      ["Metro", "Barilla Pasta, 900 g", "2/$5.00"],
      ["Metro", "Atlantic Salmon Fillets", "$19.82/kg"],
      ["Super C", "Milk 2%, 4 L", "$6.29"],
    ]);
    expect(result.deals[3]).toMatchObject({ imageUrl: "https://f.wishabi.net/m.jpg", validUntil: "2026-09-30", category: "dairy" });
  });

  it("looks up the photo of an item its flyer lists without one", async () => {
    const lookups = [];
    const fetchWithItems = (url) => {
      const u = new URL(url);
      if (u.pathname.includes("/flipp/items/")) {
        lookups.push(u.pathname.split("/").pop());
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: { cutout_image_url: `https://f.wishabi.net/${lookups.at(-1)}.jpg` } }) });
      }
      return fakeFetch(url);
    };
    const result = await fetchFlippDeals({ postalCode: "H2T2S3", stores: ["Metro"], fetchImpl: fetchWithItems });
    const pasta = result.deals.find((d) => d.item.startsWith("Barilla"));
    expect(lookups).toContain(String(pasta && ITEMS["101"].items.find((i) => i.name.startsWith("Barilla")).id));
    expect(pasta.imageUrl).toMatch(/^https:\/\/f\.wishabi\.net\/.+\.jpg$/);
  });

  it("takes every grocery flyer when no stores are chosen, and reports a flyer that fails", async () => {
    const failing = (url) =>
      url.includes("/flyers/104") ? Promise.resolve({ ok: false, status: 500 }) : fakeFetch(url);
    const result = await fetchFlippDeals({ postalCode: "H2T2S3", fetchImpl: failing });
    expect(result.flyers.map((f) => f.merchant)).toEqual(["Metro", "Super C", "IGA"]);
    expect(result.failed).toEqual(["IGA: Flipp answered 500 for /flipp/flyers/104"]);
  });
});

describe("regularPriceFor", () => {
  const priced = { unitPrice: 4.49 };
  it("reads the usual price from Save / Reg. texts", () => {
    expect(regularPriceFor({ sale_story: "SAVE $2.00" }, priced)).toBe(6.49);
    expect(regularPriceFor({ sale_story: "Économisez 1,50 $" }, priced)).toBe(5.99);
    expect(regularPriceFor({ sale_story: "SAVE 25%" }, priced)).toBe(5.99);
    expect(regularPriceFor({ description: "Reg. $6.99" }, priced)).toBe(6.99);
  });

  it("ignores up-to savings and prices that don't add up", () => {
    expect(regularPriceFor({ sale_story: "SAVE UP TO $3" }, priced)).toBeNull();
    expect(regularPriceFor({ description: "Reg. $3.99" }, priced)).toBeNull();
    expect(regularPriceFor({}, priced)).toBeNull();
  });
});

// Shaped like Flipp's real answers (October 2026): the flyer list has only
// the name, the bare price, a print id and a discount %; the units, the
// description, the regular price and "rabais de" are on each item's page.
describe("fetchFlippDeals with each item's own page", () => {
  const FLYER_LIST = { flyers: [{ id: 7, merchant: "Super C", categories: ["Groceries"] }, { id: 8, merchant: "Maxi", categories: ["Groceries"] }] };
  const LIST = {
    7: { items: [
      { id: 71, name: "pommes Cortland, McIntosh, Lobo | apples", price: "5.99", discount: 14 },
      { id: 72, name: "vin rouge ou blanc Les Trois Pignons, Ciao Amore | red or white wine", price: "3.0" },
      { id: 73, name: "cuisses de poulet frais | fresh chicken legs", price: "3.99", discount: 60 },
      { id: 74, name: "yogourt grec | Greek yogurt", price: "7.0" },
      { id: 75, name: "jambon tranché | sliced ham", price: "1.49" },
      { id: 76, name: "VIN ROUGE OU BLANC | RED OR WHITE WINE", price: "", discount: null },
    ] },
    8: { items: [{ id: 81, name: "POMMES CORTLAND OU MCINTOSH", price: "0.99", print_id: "20914172001_KG", discount: 41 }] },
  };
  const PAGES = {
    71: { item: { description: "produit du Québec, Canada de fantaisie, sac 4 lb", current_price: "5.99", original_price: "6.99", dollars_off: 1, percent_off: 14, cutout_image_url: "https://f.wishabi.net/a.jpg" } },
    72: { item: { description: "750 ml, choix varié", pre_price_text: "rebais de", current_price: "3.0" } },
    73: { item: { price_text: "/lb - 8,80$/kg", current_price: "3.99", original_price: "9.99", dollars_off: 6, percent_off: 60 } },
    74: { item: { pre_price_text: "2/", price_text: "ou 4,99$ l'unité", description: "500 g" } },
    75: { item: { price_text: "le 100 g" } },
    81: { item: { description: "Produit du Québec, catégorie Canada de fantaisie 2,18/kg" } },
  };
  const pagesSeen = [];
  const fetchReal = (url) => {
    const u = new URL(url);
    const id = u.pathname.split("/").pop();
    let body;
    if (u.pathname.endsWith("/flipp/flyers")) body = FLYER_LIST;
    else if (u.pathname.includes("/items/")) {
      pagesSeen.push(id);
      body = PAGES[id] ?? { item: {} };
    } else body = LIST[id] ?? { items: [] };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  };

  it("prices every item from its page: units, bag sizes, regular prices and amounts off", async () => {
    const { deals } = await fetchFlippDeals({ postalCode: "H2T2S3", stores: ["Super C", "Maxi"], fetchImpl: fetchReal });
    const find = (re) => deals.find((d) => re.test(d.item));

    // A 4 lb bag: named with its size (so it's compared per lb), regular price kept.
    expect(find(/Lobo/).item).toBe("pommes Cortland, McIntosh, Lobo | apples, 4 lb bag");
    expect(find(/Lobo/)).toMatchObject({ unitPrice: 5.99, unitBasis: "each", regularPrice: 6.99, imageUrl: "https://f.wishabi.net/a.jpg" });
    // "rabais de 3$" is $3 off, not a $3 wine.
    expect(find(/Trois Pignons/)).toMatchObject({ price: "$3.00 off", unitPrice: null, unitBasis: null, regularPrice: null });
    // Unit from price_text, regular from original_price.
    expect(find(/cuisses/)).toMatchObject({ price: "$3.99/lb", unitPrice: 3.99, unitBasis: "lb", regularPrice: 9.99 });
    // "2/" from the page; "l'unité" is not litres.
    expect(find(/yogourt/)).toMatchObject({ price: "2/$7.00", unitPrice: 3.5, unitBasis: "each" });
    // "le 100 g" -> per lb.
    expect(find(/jambon/)).toMatchObject({ price: "$1.49/100 g", unitPrice: 6.76, unitBasis: "lb" });
    // Maxi's _KG print id: priced per lb.
    expect(deals.find((d) => d.store === "Maxi")).toMatchObject({ price: "$0.99/lb", unitPrice: 0.99, unitBasis: "lb" });
    // Unpriced tiles aren't looked up.
    expect(pagesSeen).not.toContain("76");
  });

  it("falls back to the list's own fields when item pages can't be read", async () => {
    const down = (url) =>
      url.includes("/items/") ? Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }) : fetchReal(url);
    const { deals } = await fetchFlippDeals({ postalCode: "H2T2S3", stores: ["Maxi"], fetchImpl: down });
    expect(deals).toEqual([expect.objectContaining({ item: "POMMES CORTLAND OU MCINTOSH", unitPrice: 0.99, unitBasis: "lb" })]);
  });
});

describe("amounts off", () => {
  it("works out the price from the regular price when the item gives one", () => {
    expect(parseFlippPrice({ price: "3", pre_price_text: "Rabais de", original_price: "17.59" })).toEqual({ price: "$14.59", unitPrice: 14.59, unitBasis: "each" });
    expect(parseFlippPrice({ price: "3", pre_price_text: "SAVE", description: "750 ml. Reg. 17,59" })).toMatchObject({ unitPrice: 14.59 });
    expect(parseFlippPrice({ price: "3", pre_price_text: "économisez" })).toEqual({ price: "$3.00 off", unitPrice: null, unitBasis: null });
  });

  it("reads regular prices from Flipp's own fields, not 'up to' savings", () => {
    const priced = (item) => normalizeFlippItem({ name: "Cheese", ...item }, { merchant: "Super C" });
    expect(priced({ price: "5.97", original_price: "8.99" }).regularPrice).toBe(8.99);
    expect(priced({ price: "4.99", dollars_off: 1 }).regularPrice).toBe(5.99);
    expect(priced({ price: "0.99", percent_off: 50 }).regularPrice).toBe(1.98);
    expect(priced({ price: "4.97", dollars_off: 4.02, sale_story: "jusqu'à 4.02$ d'économie" }).regularPrice).toBe(null);
    // Per kg on the flyer: the regular price converts the same way.
    expect(priced({ price: "9.90", post_price_text: "/kg", original_price: "13.20" })).toMatchObject({ unitPrice: 4.49, regularPrice: 5.99 });
  });
});
