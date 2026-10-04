import { describe, expect, it } from "vitest";
import {
  PROTEINS,
  ingredientIsProtein,
  isSeasoningIngredient,
  mentionsTofu,
  proteinOf,
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

  it("lists every kind even with no flyers at all, each saying nothing this week", () => {
    const rows = proteinRows([]);
    expect(ids(rows)).toEqual(PROTEINS.map((p) => p.id));
    expect(rows.every((r) => r.status === "none" && r.best === null)).toBe(true);
    expect(ids(proteinRows(undefined))).toHaveLength(PROTEINS.length);
  });

  it("puts a real deal first and keeps the kinds with nothing after it", () => {
    const rows = proteinRows([deal("Boneless chicken breast", "meat", { regularPrice: 5.99, unitPrice: 3.99, unitBasis: "lb" })]);
    expect(rows[0]).toMatchObject({ status: "deal" });
    expect(rows[0].protein.id).toBe("chicken");
    expect(rows).toHaveLength(PROTEINS.length);
    expect(rows.slice(1).every((r) => r.status === "none")).toBe(true);
  });

  it("shows this week's tofu even when nothing says if the price is good", () => {
    const rows = proteinRows([deal("Smoked tofu, 350 g", "other")]);
    const tofu = rows.find((r) => r.protein.id === "tofu");
    expect(tofu.status).toBe("unsure");
    expect(tofu.best.item).toBe("Smoked tofu, 350 g");
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
    expect(rows).toHaveLength(PROTEINS.length);
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
