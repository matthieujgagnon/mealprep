import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, quebecDay } from "./quebecDay.js";
import {
  PROTEINS,
  PROTEIN_CARD_ORDER,
  ingredientIsProtein,
  isSeasoningIngredient,
  mentionsTofu,
  proteinOf,
  proteinProduct,
  proteinRows,
  proteinsOnSale,
  recipeUsesProtein,
  recipesUsingProtein,
} from "./proteins.js";

const deal = (item, aisle, extra = {}) => ({ id: item, store: "Metro", item, matchName: item.toLowerCase(), aisle, unitPrice: 2.99, unitBasis: "each", price: "$2.99", ...extra });

describe("tofu as a protein", () => {
  it("is one of the kinds Home lists", () => {
    expect(PROTEINS.map((p) => p.id)).toContain("tofu");
  });

  it("finds tofu in whatever aisle the store keeps it", () => {
    for (const aisle of ["meat", "dairy", "produce", "deli", "other", undefined]) {
      expect(proteinOf(deal("Firm tofu", aisle))?.id).toBe("tofu");
    }
    expect(proteinOf(deal("Tofu ferme", "other"))?.id).toBe("tofu");
  });

  it("still keeps non-meat out of the other kinds", () => {
    expect(proteinOf(deal("Chicken flavoured crackers", "snacks"))).toBeNull();
    expect(proteinOf(deal("Boneless chicken breast", "meat"))?.id).toBe("chicken");
  });

  it("lists a tofu on sale with the other kinds", () => {
    const kinds = proteinsOnSale([deal("Silken tofu", "other"), deal("Boneless chicken breast", "meat")]);
    expect(kinds.map((k) => k.protein.id)).toEqual(["chicken", "tofu"]);
  });

  it("keeps smoked, marinated, pouched and crispy tofu: it's still tofu to cook with", () => {
    for (const name of ["Smoked tofu", "Crispy tofu bites", "Sunrise Soya Foods Tofu Pouch", "Marinated tofu, 227 g", "Tofu - ferme ou extra-ferme", "Organic tofu, extra firm"]) {
      expect(proteinOf(deal(name, "meat"))?.id).toBe("tofu");
    }
  });

  it("leaves out a made dish with tofu in it", () => {
    for (const name of ["Miso soup with tofu", "Tofu salad", "Tofu burgers", "Pork and tofu dumplings", "Tofu pad thai noodles"]) {
      expect(proteinOf(deal(name, "other"))).toBeNull();
    }
  });

  it("recognizes every kind of tofu in a recipe's ingredients", () => {
    for (const name of ["tofu", "firm tofu", "extra-firm tofu, drained", "Silken Tofu", "tofu ferme", "14 oz block of tofu"]) {
      expect(mentionsTofu(name)).toBe(true);
    }
    for (const name of ["tofurky slices", "chicken", ""]) expect(mentionsTofu(name)).toBe(false);
  });
});

describe("recipes that use a protein", () => {
  const recipe = (title, ingredients = [], extra = {}) => ({ title, tags: [], ingredients: ingredients.map((name) => ({ name })), ...extra });
  const kind = (id) => PROTEINS.find((p) => p.id === id);

  it("counts the recipes that have that protein as an ingredient", () => {
    const recipes = [
      recipe("Curry", ["chicken thighs"]),
      recipe("Poulet rôti", ["poulet"]),
      recipe("Tofu bowl", ["firm tofu"]),
      recipe("Rice", ["rice"]),
      recipe("Note", [], { isPlaceholder: true, title: "chicken night" }),
    ];
    expect(recipesUsingProtein(recipes, kind("chicken")).map((r) => r.title)).toEqual(["Curry", "Poulet rôti"]);
    expect(recipesUsingProtein(recipes, kind("tofu"))).toHaveLength(1);
    expect(recipesUsingProtein(recipes, kind("pork"))).toHaveLength(0);
  });

  it("gives tofu its own emoji", () => {
    expect(kind("tofu").emoji).not.toBe("🫘");
    expect(new Set(PROTEINS.map((p) => p.emoji)).size).toBe(PROTEINS.length);
  });
});

describe("Home's protein rows", () => {
  const ids = (rows) => rows.map((r) => r.protein.id);

  it("has no rows with no flyers at all", () => {
    expect(proteinRows([])).toEqual([]);
    expect(proteinRows(undefined)).toEqual([]);
  });

  it("is the design's order and names every kind once", () => {
    expect([...PROTEIN_CARD_ORDER].sort()).toEqual(PROTEINS.map((p) => p.id).sort());
    expect(PROTEIN_CARD_ORDER).toEqual(["chicken", "seafood", "fish", "beef", "pork", "tofu", "turkey", "lamb-veal"]);
  });

  it("hides a kind with nothing on sale, and keeps the design's order whatever the savings", () => {
    const sale = (item, aisle, regular, price) => deal(item, aisle, { regularPrice: regular, unitPrice: price, unitBasis: "lb" });
    const rows = proteinRows([
      sale("Pork loin", "meat", 8.99, 2.99), // 67% off
      sale("Atlantic salmon", "seafood", 14.99, 13.99), // 7% off
      sale("Boneless chicken breast", "meat", 5.99, 3.99),
      deal("Lean ground beef", "meat", { unitPrice: 6.99, unitBasis: "lb", regularPrice: 6.99 }), // a normal price: not a sale
    ]);
    expect(ids(rows)).toEqual(["chicken", "fish", "pork"]);
    expect(rows.every((r) => r.status === "deal")).toBe(true);
  });

  it("puts a kind we can't judge yet in its place among the deals", () => {
    const rows = proteinRows([
      deal("Firm tofu", "other"),
      deal("Pork loin", "meat", { regularPrice: 8.99, unitPrice: 2.99, unitBasis: "lb" }),
      deal("Whole turkey", "meat", { regularPrice: 6.99, unitPrice: 3.49, unitBasis: "lb" }),
    ]);
    expect(rows.map((r) => [r.protein.id, r.status])).toEqual([
      ["pork", "deal"],
      ["tofu", "unsure"],
      ["turkey", "deal"],
    ]);
  });

  describe("the Best deal row", () => {
    const sale = (item, aisle, regular, price, extra = {}) => deal(item, aisle, { id: item, regularPrice: regular, unitPrice: price, unitBasis: "lb", ...extra });
    const bestDealIds = (rows) => rows.filter((r) => r.bestDeal).map((r) => r.protein.id);

    it("goes to the row whose best buy has the biggest real saving, not the lowest price", () => {
      const rows = proteinRows([
        sale("Whole chicken", "meat", 3.49, 1.99), // 43% off and the cheapest per lb
        sale("Striploin steak", "meat", 19.99, 9.99), // 50% off
        sale("Pork loin", "meat", 5.99, 3.99), // 33% off
      ]);
      expect(bestDealIds(rows)).toEqual(["beef"]);
    });

    it("breaks a tie on the % the pills read by the lowest price per lb", () => {
      // 49.6% and 50.4% both read "50% off"
      const rows = proteinRows([
        sale("Striploin steak", "meat", 19.84, 10.0),
        sale("Pork loin", "meat", 5.04, 2.5),
      ]);
      expect(bestDealIds(rows)).toEqual(["pork"]);
    });

    it("is on one row only, and never a kind we can't judge yet", () => {
      const rows = proteinRows([deal("Firm tofu", "other"), sale("Pork loin", "meat", 8.99, 2.99), sale("Whole turkey", "meat", 6.99, 3.49)]);
      expect(rows.filter((r) => r.bestDeal)).toHaveLength(1);
      expect(rows.find((r) => r.protein.id === "tofu").bestDeal).toBe(false);
      expect(proteinRows([deal("Firm tofu", "other")]).some((r) => r.bestDeal)).toBe(false);
    });
  });

  it("shows this week's tofu even when nothing says if the price is good", () => {
    const rows = proteinRows([deal("Smoked tofu, 350 g", "other")]);
    const tofu = rows.find((r) => r.protein.id === "tofu");
    expect(tofu.status).toBe("unsure");
    expect(tofu.best.item).toBe("Smoked tofu, 350 g");
  });

  it("opens an unsure kind onto its priced items, and a deal onto its real sales", () => {
    const rows = proteinRows([
      deal("Smoked tofu, 350 g", "other"),
      deal("Firm tofu, 454 g", "other"),
      deal("Boneless chicken breast", "meat", { regularPrice: 5.99, unitPrice: 3.99, unitBasis: "lb" }),
    ]);
    const tofu = rows.find((r) => r.protein.id === "tofu");
    expect(tofu.status).toBe("unsure");
    expect(tofu.products.map((d) => d.item).sort()).toEqual(["Firm tofu, 454 g", "Smoked tofu, 350 g"]);
    const chicken = rows.find((r) => r.protein.id === "chicken");
    expect(chicken.products).toEqual(chicken.onSale);
    expect(rows.find((r) => r.protein.id === "beef")).toBeUndefined();
  });

  it("gives a tofu with a real saving the deal row", () => {
    const rows = proteinRows([deal("Firm tofu", "other", { regularPrice: 3.99, unitPrice: 2.49 })]);
    expect(rows[0].protein.id).toBe("tofu");
    expect(rows[0].status).toBe("deal");
  });

  it("lamb has its own emoji, and so does every other kind", () => {
    expect(PROTEINS.find((p) => p.id === "lamb-veal").emoji).toBe("🐑");
    expect(PROTEINS.every((p) => p.emoji)).toBe(true);
  });
});

describe("what a product card shows", () => {
  // A fixed clock: 11:30 p.m. in Quebec on Oct 14, 2026, already Oct 15 in UTC.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T03:30:00Z"));
  });
  afterEach(() => vi.useRealTimers());
  // The flyer's end day is a Quebec day, so today is the Quebec day (lib/quebecDay.js).
  const keyIn = (days) => addDays(quebecDay(), days);
  const chicken = (extra = {}) => deal("Boneless chicken thighs", "meat", { id: "t", unitPrice: 3.99, unitBasis: "lb", ...extra });

  it("gives the price, the sale % and the regular price from the flyer", () => {
    const p = proteinProduct(chicken({ regularPrice: 7.98 }));
    expect(p).toMatchObject({ store: "Metro", amount: "$3.99", unit: "/lb", off: "50% off", regular: "$7.98/lb" });
  });

  it("leaves out everything the flyers don't really give", () => {
    const p = proteinProduct(chicken());
    expect(p.off).toBeNull();
    expect(p.regular).toBeNull();
    expect(p.ends).toBeNull();
    expect(p.qc).toBeNull();
  });

  it("puts the regular price on the same footing as the price (a pack price per lb, an each price each)", () => {
    const p = proteinProduct(chicken({ unitPrice: 4, unitBasis: "lb", comparePrice: 2, compareBasis: "lb", regularPrice: 8 }));
    expect(p).toMatchObject({ amount: "$2.00", regular: "$4.00/lb" });
    expect(proteinProduct(deal("Firm tofu", "other", { unitPrice: 2.49, regularPrice: 3.99 }))).toMatchObject({ unit: " ea", regular: "$3.99 ea" });
  });

  it("says when the sale ends: today, tomorrow, the weekday, then the date; nothing once it has ended", () => {
    expect(proteinProduct(chicken({ validUntil: keyIn(0) })).ends).toBe("today");
    expect(proteinProduct(chicken({ validUntil: keyIn(1) })).ends).toBe("tomorrow");
    const weekday = new Intl.DateTimeFormat("en-CA", { weekday: "long" }).format(new Date(keyIn(3) + "T12:00:00"));
    expect(proteinProduct(chicken({ validUntil: keyIn(3) })).ends).toBe(weekday);
    expect(proteinProduct(chicken({ validUntil: keyIn(9) })).ends).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    expect(proteinProduct(chicken({ validUntil: keyIn(-1) })).ends).toBeNull();
  });

  it("compares with Quebec's average only when a matching product has one, green only when it is lower", () => {
    expect(proteinProduct(chicken({ baseline: { pct: -45 } })).qc).toEqual({ text: "−45%", good: true });
    expect(proteinProduct(chicken({ baseline: { pct: 12 } })).qc).toEqual({ text: "+12%", good: false });
    expect(proteinProduct(chicken({ baseline: { pct: 0 } })).qc).toEqual({ text: "near average", good: false });
  });

  it("is named in French from the French half of the flyer's name, and falls back to the product's name", async () => {
    const { setLang } = await import("../i18n/index.js");
    setLang("fr");
    try {
      const p = proteinProduct(deal("Poitrines de poulet désossées Maple Leaf | Boneless chicken breasts", "meat", { matchName: "boneless chicken breasts" }));
      expect(p.name).toMatch(/^Poitrines de poulet/);
      expect(p.english).toBe("Chicken breasts"); // an item put on the list in English still counts
      // A flyer with no French half has only the product's name.
      expect(proteinProduct(deal("Whole chicken", "meat")).name).toBe("Whole chicken");
    } finally {
      setLang("en");
    }
    expect(proteinProduct(deal("Poitrines de poulet désossées | Boneless chicken breasts", "meat", { matchName: "boneless chicken breasts" })).name).toBe("Chicken breasts");
  });

  it("names the product without brand or pack words", () => {
    expect(proteinProduct(deal("Maple Leaf boneless chicken thighs, 900 g", "meat")).name).toBe("Chicken thighs");
  });
});

describe("one general protein for every specific item", () => {
  const kindOf = (item, aisle = "meat") => proteinOf(deal(item, aisle))?.id ?? null;

  it("puts every kind of chicken under Chicken", () => {
    for (const name of ["Boneless chicken breasts", "Chicken thighs", "Chicken drumsticks", "Drumsticks", "Whole chicken", "Poitrines de poulet", "Pilons de poulet", "Hauts de cuisse de poulet", "Cornish hens"]) {
      expect(kindOf(name), name).toBe("chicken");
    }
  });

  it("puts every kind of fish under Fish and shellfish under Seafood", () => {
    for (const name of ["Atlantic salmon fillet", "Cod fillets", "Tilapia", "Rainbow trout", "Haddock", "Pavé de saumon", "Fresh tuna steak", "Swordfish steak"]) {
      expect(kindOf(name, "seafood"), name).toBe("fish");
    }
    for (const name of ["Large shrimp", "Sea scallops", "Lobster tails", "Moules", "Snow crab legs"]) {
      expect(kindOf(name, "seafood"), name).toBe("seafood");
    }
  });

  it("puts ground beef, steaks and roasts under Beef; pork, turkey and lamb under their own", () => {
    for (const name of ["Lean ground beef", "Bœuf haché maigre", "Striploin steak", "Rib eye steaks", "Beef brisket", "Eye of round roast", "Stewing beef"]) {
      expect(kindOf(name), name).toBe("beef");
    }
    expect(kindOf("Pork loin chops")).toBe("pork");
    expect(kindOf("Whole turkey")).toBe("turkey");
    expect(kindOf("Lamb leg")).toBe("lamb-veal");
    expect(kindOf("Veal cutlets")).toBe("lamb-veal");
  });

  it("shows each general protein once, however many specific items it has, best deal first", () => {
    const rows = proteinRows([
      deal("Boneless chicken breasts", "meat", { id: "a", regularPrice: 8.99, unitPrice: 4.99, unitBasis: "lb" }),
      deal("Chicken thighs", "meat", { id: "b", regularPrice: 6.99, unitPrice: 2.49, unitBasis: "lb" }),
      deal("Whole chicken", "meat", { id: "c", unitPrice: 2.99, unitBasis: "lb" }),
      deal("Atlantic salmon", "seafood", { id: "d", regularPrice: 14.99, unitPrice: 9.99, unitBasis: "lb" }),
      deal("Cod fillets", "seafood", { id: "e", regularPrice: 12.99, unitPrice: 8.99, unitBasis: "lb" }),
    ]);
    expect(rows.filter((r) => r.protein.id === "chicken")).toHaveLength(1);
    expect(rows.filter((r) => r.protein.id === "fish")).toHaveLength(1);
    expect(rows).toHaveLength(2);
    const chicken = rows.find((r) => r.protein.id === "chicken");
    expect(chicken.best.item).toBe("Chicken thighs"); // the biggest saving
    expect(chicken.all).toHaveLength(3); // the others are "Also on sale"
  });

  it("names the general protein in both languages", async () => {
    const { setLang } = await import("../i18n/index.js");
    const names = (lang) => {
      setLang(lang);
      return PROTEINS.map((p) => p.label);
    };
    try {
      expect(names("en")).toEqual(["Chicken", "Beef", "Pork", "Fish", "Seafood", "Turkey", "Lamb", "Tofu"]);
      expect(names("fr")).toEqual(["Poulet", "Bœuf", "Porc", "Poisson", "Fruits de mer", "Dinde", "Agneau", "Tofu"]);
    } finally {
      setLang("en");
    }
  });
});

describe("the recipe count covers every kind of that protein", () => {
  const recipe = (title, ingredients = [], extra = {}) => ({ title, tags: [], ingredients: ingredients.map((name) => ({ name })), ...extra });
  const kind = (id) => PROTEINS.find((p) => p.id === id);
  const titles = (id, recipes) => recipesUsingProtein(recipes, kind(id)).map((r) => r.title);

  it("counts a recipe that uses any cut, in English or French", () => {
    const recipes = [
      recipe("Thigh bake", ["bone-in chicken thighs"]),
      recipe("BBQ legs", ["chicken drumsticks"]),
      recipe("Poulet au beurre", ["poitrines de poulet"]),
      recipe("Pilons rôtis", ["pilons"]),
      recipe("Whole roast", ["whole chicken"]),
      recipe("Rice", ["rice"]),
    ];
    expect(titles("chicken", recipes)).toEqual(["Thigh bake", "BBQ legs", "Poulet au beurre", "Pilons rôtis", "Whole roast"]);
  });

  it("counts fish by any fish, beef by any cut, seafood by any shellfish", () => {
    const recipes = [
      recipe("Baked cod", ["cod fillets"]),
      recipe("Salmon bowl", ["salmon"]),
      recipe("Fish tacos", ["tilapia"]),
      recipe("Chili", ["lean ground beef"]),
      recipe("Steak frites", ["striploin steak"]),
      recipe("Brisket", ["beef brisket"]),
      recipe("Paella", ["shrimp", "mussels"]),
      recipe("Pasta", ["pasta"]),
    ];
    expect(titles("fish", recipes)).toEqual(["Baked cod", "Salmon bowl", "Fish tacos"]);
    expect(titles("beef", recipes)).toEqual(["Chili", "Steak frites", "Brisket"]);
    expect(titles("seafood", recipes)).toEqual(["Paella"]);
  });

  it("looks at the title and tags only when a recipe lists no ingredients yet", () => {
    expect(recipeUsesProtein(recipe("Chicken soup", []), kind("chicken"))).toBe(false); // soup: a dish, not the ingredient
    expect(recipeUsesProtein(recipe("Poulet rôti", []), kind("chicken"))).toBe(true);
    expect(recipeUsesProtein(recipe("Weeknight", [], { tags: ["fish"] }), kind("fish"))).toBe(true);
    // With ingredients listed, the title no longer counts: "Fish tacos" made with tofu.
    expect(recipeUsesProtein(recipe("Fish tacos", ["tofu", "tortillas"]), kind("fish"))).toBe(false);
  });

  it("is one function for Home's count and Recipes' filter", () => {
    const recipes = [recipe("A", ["chicken thighs"]), recipe("B", ["cod"]), recipe("C", ["beef brisket"]), recipe("D", ["rice"]), recipe("E", ["tofu", "pork belly"])];
    for (const p of PROTEINS) {
      expect(recipesUsingProtein(recipes, p)).toEqual(recipes.filter((r) => recipeUsesProtein(r, p)));
    }
  });
});

describe("a sauce, stock or seasoning is not the protein", () => {
  const recipe = (title, ingredients = []) => ({ title, tags: [], ingredients: ingredients.map((name) => ({ name })) });
  const kind = (id) => PROTEINS.find((p) => p.id === id);

  it("a recipe whose only fish is fish sauce doesn't count as Fish", () => {
    expect(recipeUsesProtein(recipe("Pad thai", ["rice noodles", "fish sauce", "lime"]), kind("fish"))).toBe(false);
    expect(recipeUsesProtein(recipe("Pad thaï", ["sauce de poisson"]), kind("fish"))).toBe(false);
    // ...but with real fish too, it does.
    expect(recipeUsesProtein(recipe("Fish curry", ["fish sauce", "cod fillets"]), kind("fish"))).toBe(true);
  });

  it("chicken or beef stock, broth and bouillon don't count as Chicken or Beef", () => {
    for (const name of ["chicken stock", "low-sodium chicken broth", "chicken bouillon cubes", "chicken bouillon powder", "bouillon de poulet", "fond de poulet", "poulet (bouillon)"]) {
      expect(ingredientIsProtein(name, kind("chicken")), name).toBe(false);
    }
    for (const name of ["beef stock", "beef broth", "beef bouillon cubes", "beef bouillon powder", "bouillon de bœuf", "bouillon de boeuf", "fond de boeuf"]) {
      expect(ingredientIsProtein(name, kind("beef")), name).toBe(false);
    }
    expect(recipeUsesProtein(recipe("Rice", ["rice", "chicken stock"]), kind("chicken"))).toBe(false);
  });

  it("oyster sauce, anchovy paste and the like don't count", () => {
    expect(ingredientIsProtein("oyster sauce", kind("seafood"))).toBe(false);
    expect(ingredientIsProtein("sauce aux huîtres", kind("seafood"))).toBe(false);
    expect(ingredientIsProtein("oyster mushrooms", kind("seafood"))).toBe(false);
    expect(ingredientIsProtein("anchovy paste", kind("fish"))).toBe(false);
    expect(ingredientIsProtein("shrimp paste", kind("seafood"))).toBe(false);
    expect(ingredientIsProtein("clam juice", kind("seafood"))).toBe(false);
    expect(ingredientIsProtein("chicken seasoning", kind("chicken"))).toBe(false);
    expect(ingredientIsProtein("cream of chicken soup", kind("chicken"))).toBe(false);
  });

  it("the real thing still counts", () => {
    expect(ingredientIsProtein("boneless chicken breasts", kind("chicken"))).toBe(true);
    expect(ingredientIsProtein("fresh oysters", kind("seafood"))).toBe(true);
    expect(ingredientIsProtein("lean ground beef", kind("beef"))).toBe(true);
    expect(ingredientIsProtein("beef stew cubes", kind("beef"))).toBe(true); // meat, not bouillon
    expect(ingredientIsProtein("filets de poisson blanc", kind("fish"))).toBe(true);
    expect(ingredientIsProtein("Bœuf haché", kind("beef"))).toBe(true);
  });

  it("names every kind of seasoning it skips", () => {
    for (const name of ["fish sauce", "oyster sauce", "chicken stock", "beef broth", "bouillon cube", "sauce de poisson", "pate d'anchois", "chicken base"]) {
      expect(isSeasoningIngredient(name), name).toBe(true);
    }
    for (const name of ["chicken thighs", "salmon", "tofu"]) expect(isSeasoningIngredient(name), name).toBe(false);
  });
});
