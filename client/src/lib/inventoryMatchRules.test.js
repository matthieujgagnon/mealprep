import { describe, expect, it } from "vitest";
import { haveItemFor, ingredientHave, itemCovers, matchingItems } from "./inventoryMatch.js";

// The table of expected answers for the names the matcher used to miss (rice wine
// vinegar and rice vinegar, low-sodium soy sauce, liquid honey, balsamic, lime and its
// juice, coriander and cilantro, lime leaves...), and for the ones it must keep right.
// Each row is [what you have in Inventory, what the recipe says]. Rows with `both`
// are the same answer the other way round too.

// A row and its mirror image.
const both = (rows) => rows.flatMap(([a, b]) => [[a, b], [b, a]]);

describe("describing words are left out on both sides", () => {
  it.each(
    both([
      ["soy sauce", "low sodium soy sauce"],
      ["soy sauce", "low-sodium soy sauce"],
      ["soy sauce", "reduced sodium soy sauce"],
      ["soy sauce", "reduced-sodium soy sauce"],
      ["low sodium soy sauce", "reduced sodium soy sauce"],
      ["milk", "low fat milk"],
      ["milk", "low-fat milk"],
      ["sour cream", "reduced fat sour cream"],
      ["yogurt", "fat free yogurt"],
      ["yogurt", "fat-free yogurt"],
      ["coconut milk", "full fat coconut milk"],
      ["coconut milk", "full-fat coconut milk"],
      ["tomato paste", "no salt added tomato paste"],
      ["tomato paste", "no-salt-added tomato paste"],
      ["honey", "liquid honey"],
      ["lemon", "unwaxed lemon"],
      ["lemons", "unwaxed lemons"],
      // Quebec French, feminine forms too.
      ["sauce soya", "sauce soya faible en sodium"],
      ["sauce soya", "sauce soya réduite en sodium"],
      ["sauce soya", "sauce soya à teneur réduite en sodium"],
      ["sauce soya", "sauce soya à faible teneur en sodium"],
      ["lait", "lait faible en gras"],
      ["lait", "lait réduit en gras"],
      ["lait", "lait sans gras"],
      ["crème sure", "crème sure réduite en gras"],
      ["crème sure", "crème sure faible en gras"],
      ["yogourt", "yogourt sans gras"],
      ["pâte de tomate", "pâte de tomate sans sel ajouté"],
      ["miel", "miel liquide"],
      ["citron", "citron non ciré"],
      ["citrons", "citrons non cirés"],
      ["limes", "limes non cirées"],
      // Across the two languages.
      ["soy sauce", "sauce soya faible en sodium"],
      ["Sauce soya", "low sodium soy sauce"],
      ["honey", "miel liquide"],
      ["lemon", "citron non ciré"],
    ])
  )("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });

  it("does not drop 'dark': dark soy sauce is another sauce", () => {
    for (const [have, ingredient] of both([
      ["soy sauce", "dark soy sauce"],
      ["low sodium soy sauce", "dark soy sauce"],
    ])) {
      expect(itemCovers(have, ingredient)).toBe(false);
    }
  });
});

describe("a bulb is the plant it grows", () => {
  it.each(
    both([
      ["garlic", "garlic bulb"],
      ["fennel", "fennel bulb"],
      ["ail", "bulbe d'ail"],
      ["fenouil", "bulbe de fenouil"],
      ["fennel", "bulbe de fenouil"],
    ])
  )("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });
});

describe("a short name is the longer name when the style word names the product", () => {
  it.each(
    both([
      ["balsamic", "balsamic vinegar"],
      ["dijon", "dijon mustard"],
      ["sriracha", "sriracha sauce"],
      ["hoisin", "hoisin sauce"],
      ["worcestershire", "worcestershire sauce"],
      ["tabasco", "tabasco sauce"],
      ["teriyaki", "teriyaki sauce"],
      ["tahini", "tahini paste"],
      ["miso", "miso paste"],
      ["gochujang", "gochujang paste"],
      ["harissa", "harissa paste"],
      ["white miso", "miso"],
      ["Balsamic vinegar", "balsamic"],
      // Quebec French.
      ["vinaigre balsamique", "balsamic"],
      ["moutarde de Dijon", "dijon"],
      ["sauce sriracha", "sriracha"],
      ["sauce hoisin", "hoisin"],
      ["sauce teriyaki", "teriyaki"],
      ["pâte de miso", "miso"],
    ])
  )("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });

  it("is not a way to make plain vinegar or mustard cover them", () => {
    for (const [have, ingredient] of both([
      ["vinegar", "balsamic vinegar"],
      ["vinegar", "balsamic"],
      ["mustard", "dijon mustard"],
      ["mustard", "dijon"],
      ["soy sauce", "teriyaki sauce"],
      ["sriracha sauce", "hoisin sauce"],
      ["tahini", "miso paste"],
    ])) {
      expect(itemCovers(have, ingredient)).toBe(false);
    }
  });

  it("does not turn a dish with the word in it into the sauce", () => {
    expect(itemCovers("chicken thighs", "teriyaki chicken thighs")).toBe(true);
    expect(itemCovers("teriyaki sauce", "teriyaki chicken thighs")).toBe(false);
  });
});

describe("true synonyms, in any word order and in French", () => {
  it.each(
    both([
      ["rice vinegar", "rice wine vinegar"],
      ["rice vinegar", "vinegar rice wine"],
      ["apple cider vinegar", "cider vinegar"],
      ["red vinegar", "red wine vinegar"],
      ["vinaigre rouge", "red wine vinegar"],
      ["vinaigre rouge", "vinaigre de vin rouge"],
      ["vinaigre de riz", "vinaigre de vin de riz"],
      ["vinaigre de riz", "rice wine vinegar"],
      ["vinaigre de cidre", "vinaigre de cidre de pomme"],
      ["vinaigre de cidre", "apple cider vinegar"],
      // Wine vinegar is red or white.
      ["wine vinegar", "red wine vinegar"],
      ["wine vinegar", "white wine vinegar"],
      ["vinaigre de vin", "vinaigre de vin blanc"],
    ])
  )("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });

  it.each(
    both([
      ["red wine", "red wine vinegar"],
      ["white wine", "white wine vinegar"],
      ["red wine vinegar", "white wine vinegar"],
      ["vinegar", "rice vinegar"],
      ["white vinegar", "rice vinegar"],
      ["vinaigre blanc", "vinegar rice wine"],
      ["vinegar", "cider vinegar"],
      ["white vinegar", "white wine vinegar"],
      ["vinaigre", "vinaigre de riz"],
    ])
  )("%s does not cover %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(false);
  });
});

describe("seasoned is not a describing word", () => {
  it("seasoned rice vinegar covers rice vinegar, one way only", () => {
    expect(itemCovers("seasoned rice vinegar", "rice vinegar")).toBe(true);
    expect(itemCovers("seasoned rice vinegar", "rice wine vinegar")).toBe(true);
    expect(itemCovers("seasoned rice wine vinegar", "rice vinegar")).toBe(true);
    expect(itemCovers("vinaigre de riz assaisonné", "rice vinegar")).toBe(true);
    expect(itemCovers("seasoned rice vinegar", "vinaigre de riz")).toBe(true);
    expect(itemCovers("rice vinegar", "seasoned rice vinegar")).toBe(false);
    expect(itemCovers("rice wine vinegar", "seasoned rice vinegar")).toBe(false);
    expect(itemCovers("vinaigre de riz", "vinaigre de riz assaisonné")).toBe(false);
  });

  it("seasoned salt is not salt", () => {
    for (const [have, ingredient] of both([
      ["seasoned salt", "salt"],
      ["sel assaisonné", "sel"],
      ["seasoned salt", "kosher salt"],
      ["seasoned rice vinegar", "vinegar"],
      ["seasoned rice vinegar", "white vinegar"],
    ])) {
      expect(itemCovers(have, ingredient)).toBe(false);
    }
  });
});

describe("a whole citrus fruit covers its juice and its zest", () => {
  it.each([
    ["lime", "lime juice"],
    ["limes", "lime zest"],
    ["limes", "the juice of 1 lime"],
    ["lime", "zest of 1 lime"],
    ["lemon", "lemon juice"],
    ["lemons", "fresh lemon juice"],
    ["lemon", "lemon zest"],
    ["lemons", "grated lemon zest"],
    ["orange", "orange zest"],
    ["oranges", "orange zest"],
    ["citron", "jus de citron"],
    ["citron", "zeste de citron"],
    ["citrons", "jus de citron"],
    ["citron vert", "jus de lime"],
    ["lime", "zeste de lime"],
    ["orange", "zeste d'orange"],
    ["lemon", "jus de citron"],
    ["citron", "lemon zest"],
  ])("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });

  it.each([
    // An orange is for its zest; its juice is another thing to buy.
    ["orange", "orange juice"],
    ["oranges", "jus d'orange"],
    // Bottled juice or zest never covers the whole fruit.
    ["lime juice", "lime"],
    ["lemon juice", "lemons"],
    ["jus de citron", "citron"],
    ["lemon zest", "lemon"],
    ["orange juice", "orange"],
    ["orange zest", "orange"],
    ["lime juice", "lime zest"],
    ["lemon zest", "lemon juice"],
    // Another fruit.
    ["lemon", "lime juice"],
    ["lime", "lemon zest"],
    ["lemon", "orange zest"],
    ["lime", "lime leaves"],
  ])("%s does not cover %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(false);
  });

  it("still covers juice with juice, and never the other way", () => {
    expect(itemCovers("lime juice", "lime juice")).toBe(true);
    expect(itemCovers("lemon juice", "fresh lemon juice")).toBe(true);
    expect(itemCovers("lemon", "lemon")).toBe(true);
  });
});

describe("coriander is cilantro, and the spice stays apart", () => {
  it.each(
    both([
      ["coriander", "cilantro"],
      ["fresh coriander", "cilantro"],
      ["coriander leaves", "cilantro"],
      ["coriander leaves", "fresh cilantro"],
      ["fresh coriander", "coriander"],
      ["coriandre", "coriander"],
      ["coriandre fraîche", "coriander"],
      ["feuilles de coriandre", "cilantro"],
      ["coriandre", "cilantro"],
    ])
  )("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });

  it("bare coriander still covers ground coriander, as it did", () => {
    expect(itemCovers("coriander", "ground coriander")).toBe(true);
    expect(itemCovers("ground coriander", "coriander")).toBe(true);
    expect(itemCovers("coriandre moulue", "ground coriander")).toBe(true);
    expect(itemCovers("ground coriander", "ground coriander")).toBe(true);
  });

  it.each(
    both([
      ["ground coriander", "cilantro"],
      ["ground coriander", "fresh cilantro"],
      ["coriandre moulue", "cilantro"],
      ["coriander seeds", "cilantro"],
      ["coriander seeds", "coriander leaves"],
      ["graines de coriandre", "cilantro"],
      ["coriander seeds", "ground coriander"],
      ["coriander seeds", "coriander"],
    ])
  )("%s does not cover %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(false);
  });
});

describe("lime, banana, grape, vine and curry leaves are products of their own", () => {
  it.each([
    ["lime", "lime leaves"],
    ["limes", "kaffir lime leaves"],
    ["lime leaves", "lime"],
    ["lime leaves", "lime juice"],
    ["banana", "banana leaves"],
    ["bananas", "banana leaves"],
    ["banana leaves", "bananas"],
    ["grapes", "grape leaves"],
    ["raisins", "grape leaves"],
    ["grape leaves", "grapes"],
    ["grape leaves", "raisins"],
    ["grape leaves", "raisins secs"],
    ["vine leaves", "grapes"],
    ["grapes", "vine leaves"],
    ["curry leaves", "curry powder"],
    ["curry powder", "curry leaves"],
    ["feuilles de lime", "lime"],
    ["lime", "feuilles de lime"],
    ["feuilles de vigne", "raisins"],
    ["raisins", "feuilles de vigne"],
    ["feuilles de bananier", "bananes"],
    ["bananes", "feuilles de bananier"],
    ["curry leaves", "curry"],
  ])("%s does not cover %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(false);
  });

  it.each([
    ["lime leaves", "lime leaves"],
    ["lime leaves", "fresh lime leaves"],
    ["lime leaves", "kaffir lime leaves"],
    ["kaffir lime leaves", "lime leaves"],
    ["curry leaves", "fresh curry leaves"],
    ["banana leaves", "banana leaves"],
    ["grape leaves", "grape leaves"],
    ["vine leaves", "vine leaves"],
    ["feuilles de lime", "lime leaves"],
    ["lime leaves", "feuilles de lime"],
    ["feuilles de vigne", "vine leaves"],
    ["feuilles de bananier", "banana leaves"],
    ["feuilles de cari", "curry leaves"],
  ])("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });

  it("every other herb leaf is still its herb", () => {
    for (const [have, ingredient] of both([
      ["bay leaves", "bay leaf"],
      ["feuilles de laurier", "bay leaves"],
      ["basil", "basil leaves"],
      ["mint", "fresh mint leaves"],
      ["cilantro", "cilantro leaves"],
      ["sage", "sage leaves"],
      ["thyme", "thyme leaves"],
    ])) {
      expect(itemCovers(have, ingredient)).toBe(true);
    }
  });
});

describe("what was right stays right", () => {
  it.each([
    ["vinaigre de riz", "rice vinegar"],
    ["rice vinegar", "vinaigre de riz"],
    ["sesame oil", "toasted sesame oil"],
    ["toasted sesame oil", "sesame oil"],
    ["huile de sésame", "toasted sesame oil"],
    ["green onions", "scallions"],
    ["scallions", "green onions"],
    ["oignons verts", "scallions"],
    ["chicken breast", "boneless skinless chicken breasts"],
    ["poitrine de poulet", "boneless skinless chicken breasts"],
    ["wonton wrappers", "wonton wrapper"],
    ["wonton wrapper", "wonton wrappers"],
    ["fish sauce", "sauce de poisson"],
    ["sauce de poisson", "fish sauce"],
    ["ginger", "fresh ginger"],
    ["gingembre", "fresh ginger"],
    ["garlic", "garlic cloves"],
    ["ail", "garlic cloves"],
    ["soy sauce", "soy sauce"],
    ["Poulet", "chicken thighs"],
  ])("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });

  it.each([
    ["red wine", "red wine vinegar"],
    ["red wine vinegar", "red wine"],
    ["vinegar", "rice vinegar"],
    ["white vinegar", "rice vinegar"],
    ["garlic powder", "garlic"],
    ["garlic", "garlic powder"],
    ["chicken stock", "chicken"],
    ["chicken", "chicken stock"],
    ["bell pepper", "pepper"],
    ["pepper", "bell pepper"],
    ["seasoned salt", "salt"],
    ["dark soy sauce", "soy sauce"],
    ["soy sauce", "dark soy sauce"],
    ["lime leaves", "lime"],
    ["grape leaves", "grapes"],
    ["grape leaves", "raisins"],
    ["vinaigre de riz", "vinaigre blanc"],
    ["honey", "honey mustard"],
    ["coconut milk", "milk"],
  ])("%s does not cover %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(false);
  });

  it("a prepared meal or a leftover never covers anything", () => {
    const meals = [
      { id: "l", name: "Rice vinegar", isLeftover: true },
      { id: "p", name: "Rice wine vinegar", isPreparedMeal: true },
    ];
    expect(matchingItems("rice vinegar", meals)).toEqual([]);
    expect(haveItemFor("rice wine vinegar", meals)).toBe(null);
    expect(ingredientHave("rice vinegar", { inventory: meals })).toBe("need");
  });

  it("an item past its date still does not count", () => {
    const old = [{ id: "v", name: "Rice wine vinegar", expiresAt: "2000-01-01" }];
    expect(matchingItems("rice vinegar", old).map((i) => i.id)).toEqual(["v"]);
    expect(haveItemFor("rice vinegar", old)).toBe(null);
    expect(ingredientHave("rice vinegar", { inventory: old })).toBe("need");
  });
});

describe("the recipe that started it", () => {
  it("Rice Vinegar in the recipe is the Rice Wine Vinegar in Inventory", () => {
    const recipe = { id: "wonton", ingredients: [{ name: "rice vinegar" }, { name: "low sodium soy sauce" }, { name: "wonton wrappers" }] };
    const kitchen = { inventory: [{ name: "Rice Wine Vinegar" }, { name: "Soy sauce" }] };
    expect(ingredientHave("rice vinegar", kitchen)).toBe("have");
    expect(ingredientHave("low sodium soy sauce", kitchen)).toBe("have");
    expect(ingredientHave("wonton wrappers", kitchen)).toBe("need");
    expect(recipe.ingredients).toHaveLength(3);
  });
});
