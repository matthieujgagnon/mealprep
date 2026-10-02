import { describe, expect, it } from "vitest";
import {
  compareToBaseline,
  coordinate,
  fetchQuebecPrices,
  findBaseline,
  parseProductName,
  readCubeMetadata,
} from "./statcan.js";
import { attachBaselines } from "../routes/deals.js";

// Shaped like StatCan's WDS answers for table 18-10-0245-01.
const METADATA = [
  {
    status: "SUCCESS",
    object: {
      productId: "18100245",
      dimension: [
        {
          dimensionPositionId: 1,
          dimensionNameEn: "Geography",
          member: [
            { memberId: 1, memberNameEn: "Canada" },
            { memberId: 6, memberNameEn: "Quebec" },
          ],
        },
        {
          dimensionPositionId: 2,
          dimensionNameEn: "Products",
          member: [
            { memberId: 3, memberNameEn: "Chicken breasts, per kilogram" },
            { memberId: 9, memberNameEn: "Milk, 2 litres" },
            { memberId: 12, memberNameEn: "Eggs, 12 units" },
            { memberId: 20, memberNameEn: "Infant formula, 900 grams" },
            { memberId: 30, memberNameEn: "Toilet paper, 12 rolls" },
          ],
        },
      ],
    },
  },
];

function point(month, value) {
  return { refPer: `${month}-01`, value, decimals: 2, scalarFactorCode: 0, statusCode: 0 };
}

function fakeFetch(url, init) {
  const body = JSON.parse(init.body);
  let data;
  if (url.endsWith("/getCubeMetadata")) data = METADATA;
  else
    data = body.map((req) => {
      const product = Number(req.coordinate.split(".")[1]);
      const series = {
        3: [point("2026-06", 13.2), point("2026-07", 12.9), point("2026-08", null)],
        9: [point("2026-08", 6.1)],
        12: [point("2026-08", 4.5)],
        20: [point("2026-08", 40)],
      }[product];
      return series
        ? { status: "SUCCESS", object: { productId: 18100245, coordinate: req.coordinate, vectorDataPoint: series } }
        : { status: "FAILED", object: "no data" };
    });
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
}

describe("Statistics Canada table", () => {
  it("finds Quebec and the product list", () => {
    const meta = readCubeMetadata(METADATA);
    expect(meta.quebecId).toBe(6);
    expect(meta.products.map((p) => p.id)).toEqual([3, 9, 12, 20, 30]);
  });

  it("builds a ten-part coordinate", () => {
    expect(coordinate([[1, 6], [2, 3]])).toBe("6.3.0.0.0.0.0.0.0.0");
  });

  it("reads product sizes into the app's unit bases", () => {
    expect(parseProductName("Chicken breasts, per kilogram")).toMatchObject({ item: "chicken breasts", basis: "lb" });
    expect(parseProductName("Milk, 2 litres")).toEqual({ item: "milk", basis: "L", factor: 0.5 });
    expect(parseProductName("Butter, 454 grams")).toMatchObject({ item: "butter", basis: "lb" });
    expect(parseProductName("Butter, 454 grams").factor).toBeCloseTo(0.999, 3);
    expect(parseProductName("Eggs, 12 units")).toEqual({ item: "eggs", basis: "each", factor: 1 });
    expect(parseProductName("Cucumber, unit")).toEqual({ item: "cucumber", basis: "each", factor: 1 });
    expect(parseProductName("Toilet paper, 12 rolls")).toBe(null);
    expect(parseProductName("Coffee")).toBe(null);
  });

  it("fetches Quebec's prices, converted and oldest first", async () => {
    const prices = await fetchQuebecPrices({ fetchImpl: fakeFetch });
    expect(prices.map((p) => p.product)).toEqual([
      "Chicken breasts, per kilogram",
      "Milk, 2 litres",
      "Eggs, 12 units",
      "Infant formula, 900 grams",
    ]);
    expect(prices[0]).toEqual({
      product: "Chicken breasts, per kilogram",
      item: "chicken breasts",
      unitBasis: "lb",
      history: [
        { month: "2026-06", price: 5.99 },
        { month: "2026-07", price: 5.85 },
      ],
    });
    expect(prices[1].history).toEqual([{ month: "2026-08", price: 3.05 }]);
  });
});

describe("matching deals to the Quebec average", () => {
  const baselines = [
    { product: "Chicken breasts, per kilogram", item: "chicken breasts", unitBasis: "lb", price: 5.85, month: "2026-07" },
    { product: "Chicken, whole, per kilogram", item: "chicken", unitBasis: "lb", price: 3.1, month: "2026-07" },
    { product: "Milk, 2 litres", item: "milk", unitBasis: "L", price: 3.05, month: "2026-08" },
  ];

  it("picks the most specific product with the same unit", () => {
    const deal = { matchName: "boneless skinless chicken breasts", unitPrice: 4.49, unitBasis: "lb" };
    expect(findBaseline(deal, baselines).product).toBe("Chicken breasts, per kilogram");
    // Drumsticks aren't a whole chicken.
    expect(findBaseline({ matchName: "chicken drumsticks", unitPrice: 2, unitBasis: "lb" }, baselines)).toBe(null);
    expect(findBaseline({ matchName: "organic whole chicken", unitPrice: 2, unitBasis: "lb" }, baselines).product).toBe("Chicken, whole, per kilogram");
    expect(findBaseline({ matchName: "chicken breasts", unitPrice: 9, unitBasis: "each" }, baselines)).toBe(null);
    expect(findBaseline({ matchName: "almond milk", unitPrice: null, unitBasis: null }, baselines)).toBe(null);
  });

  it("matches the product, not a word in another product's name", () => {
    const more = [
      ...baselines,
      { product: "Apples, per kilogram", item: "apples", unitBasis: "lb", price: 2.73, month: "2026-08" },
      { product: "Butter, 454 grams", item: "butter", unitBasis: "lb", price: 5.7, month: "2026-08" },
    ];
    const at = (matchName, unitBasis = "lb") => findBaseline({ matchName, unitPrice: 1, unitBasis }, more)?.item ?? null;
    expect(at("apples")).toBe("apples");
    expect(at("spartan apples")).toBe("apples");
    expect(at("première moisson apple-cinnamon bread")).toBe(null);
    expect(at("selection butter")).toBe("butter");
    expect(at("butter puff pastry")).toBe(null);
    expect(at("cedar coconut milk", "L")).toBe(null);
    expect(at("eagle brand condensed milk", "L")).toBe(null);
    expect(at("lactose free milk", "L")).toBe("milk");
  });

  // Real flyer items from the audit, against Statistics Canada's real
  // Quebec products.
  const QUEBEC = [
    ["Whole chicken, per kilogram", "whole chicken", "lb"],
    ["Chicken breasts, per kilogram", "chicken breasts", "lb"],
    ["Chicken thigh, per kilogram", "chicken thigh", "lb"],
    ["Chicken drumsticks, per kilogram", "chicken drumsticks", "lb"],
    ["Pork loin cuts, per kilogram", "pork loin cuts", "lb"],
    ["Pork rib cuts, per kilogram", "pork rib cuts", "lb"],
    ["Beef stewing cuts, per kilogram", "beef stewing cuts", "lb"],
    ["Ground beef, per kilogram", "ground beef", "lb"],
    ["Bacon, 500 grams", "bacon", "lb"],
    ["Salmon, per kilogram", "salmon", "lb"],
    ["Canned tuna, 170 grams", "canned tuna", "lb"],
    ["Milk, 1 litre", "milk", "L"],
    ["Milk, 2 litres", "milk", "L"],
    ["Milk, 4 litres", "milk", "L"],
    ["Cream, 1 litre", "cream", "L"],
    ["Potatoes, 4.54 kilograms", "potatoes", "lb"],
    ["Potatoes, per kilogram", "potatoes", "lb"],
    ["Onions, per kilogram", "onions", "lb"],
    ["Onions, 1.36 kilograms", "onions", "lb"],
    ["Tomatoes, per kilogram", "tomatoes", "lb"],
    ["Grapes, per kilogram", "grapes", "lb"],
    ["Canned tomatoes, 796 millilitres", "canned tomatoes", "L"],
    ["Frozen broccoli, 500 grams", "frozen broccoli", "lb"],
    ["Frozen peas, 750 grams", "frozen peas", "lb"],
    ["Canned pear, 398 millilitres", "canned pear", "L"],
    ["Avocado, unit", "avocado", "each"],
    ["Almonds, 200 grams", "almonds", "lb"],
  ].map(([product, item, unitBasis]) => ({ product, item, unitBasis, price: 1, month: "2026-08" }));
  const quebecFor = (item, matchName, unitBasis = "lb") => findBaseline({ item, matchName, unitPrice: 1, unitBasis }, QUEBEC)?.product ?? null;

  it("compares chicken only with the same cut and form", () => {
    expect(quebecFor("FERME DES VOLTIGEURS ORGANIC WHOLE CHICKEN", "ferme des voltigeurs organic whole chicken")).toBe("Whole chicken, per kilogram");
    expect(quebecFor("POITRINES DE POULET FRAIS DÉSOSSÉES", "fresh boneless chicken breasts")).toBe("Chicken breasts, per kilogram");
    expect(quebecFor("HAUTS DE CUISSES DE POULET FRAIS DÉSOSSÉS | FRESH BONELESS CHICKEN THIGHS", "fresh boneless chicken thighs")).toBe("Chicken thigh, per kilogram");
    for (const [item, matchName] of [
      ["PÂTÉ AU POULET IRRÉSISTIBLE, 1,2 kg", "chicken pie"],
      ["AILLES DE POULET BENNY & CO., 550 g", "chicken wings"],
      ["escalope de poulet PC Menu bleu, 590 g", "chicken cutlet"],
      ["BURGERS AU POULET, SOUVLAKI OU TARTES AUX ÉPINARDS GRECQUE ARAHOVA, 490-678 G", "chicken burgers"],
      ["Poulet à bouillir | frozen boiling chicken, 2,7 kg", "frozen boiling chicken"],
      ["SIMILI POULET GASPÉSIEN | GASPÉSIEN MOCK CHICKEN, 100 g", "gaspésien mock chicken"],
      ["poulet cuit et chaud | hot cooked chicken, 800 g", "hot cooked chicken"],
      ["RICARDO ROASTED PORTUGUESE CHICKEN, 950 g", "ricardo roasted portuguese chicken"],
      ["PC® BLUE MENU® GROUND CHICKEN OR MINCED TURKEY", "pc blue menu ground chicken"],
      ["FILETS DE POULET PANÉS | BREADED CHICKEN FILLETS, 450 g", "breaded chicken fillets"],
      ["FRESH CHICKEN LEGS", "fresh chicken legs"],
      ["lanières de poitrine de poulet Irrésistible | Irrésistible chicken breast strips, 200 g", "irrésistible chicken breast strips"],
      ["C'EST PRÊT! À CUIRE MARINATED FRESH CHICKEN SKEWERS", "c'est prêt! à cuire marinated fresh chicken skewers"],
    ]) {
      expect([matchName, quebecFor(item, matchName)]).toEqual([matchName, null]);
    }
  });

  it("lets a Quebec 'cuts' product stand for its cuts", () => {
    expect(quebecFor("CÔTELETTES DE PORC FRAIS | FRESH PORK LOIN CHOPS", "fresh pork loin chops")).toBe("Pork loin cuts, per kilogram");
    expect(quebecFor("côtes de flanc de porc frais | fresh pork side ribs", "fresh pork side ribs")).toBe("Pork rib cuts, per kilogram");
    expect(quebecFor("FRESH STEWING BEEF CUBES", "fresh stewing beef cubes")).toBe("Beef stewing cuts, per kilogram");
    expect(quebecFor("CÔTES DE DOS DE PORC CUITES ST‑HUBERT | ST-HUBERT COOKED PORK BACK RIBS, 625 g", "st-hubert cooked pork back ribs")).toBe(null);
    expect(quebecFor("BŒUF HACHÉ MAIGRE", "lean ground beef")).toBe("Ground beef, per kilogram");
  });

  it("keeps other products, other forms and other packs apart", () => {
    expect(quebecFor("CRÈME GLACÉE COATICOOK | COATICOOK ICE CREAM, 2 L", "coaticook ice cream", "L")).toBe(null);
    expect(quebecFor("CRÈME SURE BEATRICE | BEATRICE SOUR CREAM, 500 ML", "beatrice sour cream", "L")).toBe(null);
    expect(quebecFor("CRÈME SELECTION, 1 L", "selection cream", "L")).toBe("Cream, 1 litre");
    expect(quebecFor("LAIT CONDENSÉ SUCRÉ PC, 300 mL", "sweetened condensed milk", "L")).toBe(null);
    expect(quebecFor("LAIT FINEMENT FILTRÉ NATREL | NATREL FINE-FILTERED MILK, 4 L", "natrel fine-filtered milk", "L")).toBe("Milk, 4 litres");
    expect(quebecFor("LAIT SANS LACTOSE NATREL | NATREL LACTOSE FREE MILK, 2 L", "natrel lactose free milk", "L")).toBe("Milk, 2 litres");
    expect(quebecFor("TOMATES CERISES MIXIANY, 340 G", "cherry tomatoes")).toBe(null);
    expect(quebecFor("TOMATES RAISINS MIGNONNETTES PC, 567 G", "grape tomatoes")).toBe(null);
    expect(quebecFor("TOMATES SUR VIGNE | TOMATOES ON THE VINE", "tomatoes on the vine")).toBe("Tomatoes, per kilogram");
    expect(quebecFor("MUTTI TOMATO PASTE, 156 ml", "mutti tomato paste", "L")).toBe(null);
    expect(quebecFor("tomates Primo | Primo tomatoes, 796 ml", "primo tomatoes", "L")).toBe("Canned tomatoes, 796 millilitres");
    expect(quebecFor("CROUSTILLES ÉLEVÉES EN PROTÉINES SNACKISH, 142 G | SNACKISH HIGH PROTEIN POTATO", "snackish high protein potato")).toBe(null);
    expect(quebecFor("COOL & SIMPLE FROZEN CRISPY POTATOES, 600 g", "cool & simple frozen crispy potatoes")).toBe(null);
    expect(quebecFor("THE LITTLE POTATO CO. CREAMER POTATOES, 680 g", "the little potato co. creamer potatoes")).toBe("Potatoes, per kilogram");
    expect(quebecFor("POMMES DE TERRE ROUGES OU JAUNES, SAC DE 10 LB", "red potatoes")).toBe("Potatoes, 4.54 kilograms");
    expect(quebecFor("OIGNONS ROUGES | RED ONIONS, 3 lb", "red onions")).toBe("Onions, 1.36 kilograms");
    expect(quebecFor("OIGNON JAUNE | YELLOW ONIONS", "yellow onions")).toBe("Onions, per kilogram");
    expect(quebecFor("OIGNONS CROUSTILLANTS IRRÉSISTIBLE, 100 g", "crispy onions")).toBe(null);
    expect(quebecFor("CROWN OF BROCCOLI", "crown of broccoli")).toBe(null);
    expect(quebecFor("SUGAR SNAP PEAS, 425 g", "sugar snap peas")).toBe(null);
    expect(quebecFor("thon albacore frais | fresh albacore tuna steak", "fresh albacore tuna steak")).toBe(null);
    expect(quebecFor("CLOVER LEAF FLAKED LIGHT TUNA, 170 g", "clover leaf flaked light tuna")).toBe("Canned tuna, 170 grams");
    expect(quebecFor("DARNE DE THON JAUNE SAUVAGE 92 G OU SAUMON STEELHEAD FUMÉ 50 G", "yellow tuna steak")).toBe(null);
    expect(quebecFor("Poiriers Bartlett ou Bosc | Bartlett or Bosc pears, 2 L", "bosc pears", "L")).toBe(null);
    expect(quebecFor("SAUMON ARC-EN-CIEL FUMÉ LA BOUCANERIE | LA BOUCANERIE SMOKED STEELHEAD SALMON, 300 g", "la boucanerie smoked steelhead salmon")).toBe(null);
    expect(quebecFor("BACON SANS NOM® | BACON, 375 G", "bacon")).toBe("Bacon, 500 grams");
    expect(quebecFor("BACON FUMÉ ENTIÈREMENT CUIT | PRECOOKED SMOKED BACON, 250 g", "precooked smoked bacon")).toBe(null);
    expect(quebecFor("FARINE D'AMANDES BOB'S RED MILL | BOB'S RED MILL ALMOND FLOUR, 453 g", "bob's red mill almond flour")).toBe(null);
    expect(quebecFor("SAC D'AVOCATS DÉLICES DU MARCHÉ, 5 UN. | FARMER'S MARKET™ AVOCADO BAG", "farmer's market avocado bag", "each")).toBe("Avocado, unit");
  });

  it("rates a price against the average", () => {
    expect(compareToBaseline(4.49, 5.85)).toEqual({ pct: -23, verdict: "good" });
    expect(compareToBaseline(4.0, 5.85)).toEqual({ pct: -32, verdict: "stock-up" });
    expect(compareToBaseline(5.85, 5.85)).toEqual({ pct: 0, verdict: "normal" });
    expect(compareToBaseline(7, 5.85)).toEqual({ pct: 20, verdict: "high" });
  });

  it("attaches the average to deals that have one", () => {
    const deals = [
      { id: 1, matchName: "chicken breasts", unitPrice: 4.49, unitBasis: "lb" },
      { id: 2, matchName: "flowers", unitPrice: 9.99, unitBasis: "each" },
    ];
    const [a, b] = attachBaselines(deals, baselines);
    expect(a.baseline).toEqual({ product: "Chicken breasts, per kilogram", price: 5.85, month: "2026-07", basis: "lb", history: [], pct: -23, verdict: "good" });
    expect(b.baseline).toBeUndefined();
  });

  it("compares a pack price per lb with a per-kilogram average", () => {
    const [deal] = attachBaselines([{ id: 3, item: "Chicken breasts, 908 g", matchName: "chicken breasts", unitPrice: 8.99, unitBasis: "each" }], baselines);
    expect(deal.baseline).toMatchObject({ basis: "lb", pct: -23 });
  });
});
