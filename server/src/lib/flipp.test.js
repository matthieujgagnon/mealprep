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
