import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildTakeOut, foodKey, haveItemFor, ingredientHave, itemCovers, matchingItems, recipeHave, recipeLines, recipeUsesItem } from "./inventoryMatch.js";

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

// ---- French from the table of ingredient names -------------------------------------------------
//
// The matcher learns its French from the table (ingredientDisplay.txt, with Matt's changes on top):
// every French spelling of a row, singular and plural, is read as the row's English name. These
// rows are the answers that must hold both ways round, in both languages.

describe("French singulars and plurals are read from the table", () => {
  it.each(
    both([
      ["banane", "banana"],
      ["banane", "bananas"],
      ["bananes", "banana"],
      ["bananes", "bananas"],
      ["Banane", "BANANAS"],
      ["oignon rouge", "red onion"],
      ["oignons rouges", "red onions"],
      ["oignon rouge", "onion"],
      ["coriandre fraîche", "fresh cilantro"],
      ["coriandre fraîche", "cilantro"],
      ["coriandre", "fresh cilantro"],
      ["gousse d'ail", "garlic clove"],
      ["gousses d'ail", "garlic"],
      ["tête d'ail", "head of garlic"],
      ["tête d'ail", "ail"],
      ["chou-fleur", "cauliflower"],
      ["amande", "almonds"],
      ["poire", "pear"],
      ["citrouille", "pumpkin"],
      ["haricot noir", "black beans"],
      ["noix de coco", "coconut"],
      ["pétoncle", "scallops"],
      ["patate", "potato"],
      ["citron vert", "lime"],
      ["muscade", "nutmeg"],
      ["laurier", "bay leaf"],
      ["gros sel", "coarse salt"],
      ["mandarine", "mandarins"],
      ["tourtière", "meat pie"],
      ["croustilles", "chips"],
      ["sauce soja", "soy sauce"],
      ["poudre à lever", "baking powder"],
      ["piment de Cayenne", "cayenne pepper"],
    ])
  )("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });

  it("a word with accents is the same typed without them", () => {
    expect(itemCovers("tete d'ail", "head of garlic")).toBe(true);
    expect(itemCovers("clementine", "clémentines")).toBe(true);
    expect(itemCovers("pate de tomates", "tomato paste")).toBe(true);
  });

  it("a plural reads as its singular in English too: cheeses, cookies", () => {
    for (const [have, ingredient] of both([
      ["cheese", "cheeses"],
      ["fromage", "fromages"],
      ["fromages", "cheese"],
      ["cookie", "cookies"],
      ["biscuit", "cookies"],
      ["biscuits", "cookie"],
    ])) {
      expect(itemCovers(have, ingredient), `${have} / ${ingredient}`).toBe(true);
    }
  });
});

describe("French names that are another food stay apart", () => {
  it.each(
    both([
      // A coloured or named bean is not the plain one, as in English.
      ["haricot vert", "bean"],
      ["haricots verts", "beans"],
      ["haricot rouge", "bean"],
      ["haricots rouges", "beans"],
      ["haricots verts", "haricots noirs"],
      ["haricot noir", "haricot rouge"],
      // A chicken cut is not another.
      ["pilon de poulet", "chicken thighs"],
      ["pilon de poulet", "poitrine de poulet"],
      ["pilons de poulet", "chicken wings"],
      ["haut de cuisse de poulet", "aile de poulet"],
      // A pork chop is not a tenderloin.
      ["côtelette de porc", "filet de porc"],
      ["côtelette de porc", "pork tenderloin"],
      ["côtelette de porc", "ground pork"],
      // A lime is not a lemon, in any form of the word.
      ["citron vert", "lemon"],
      ["citrons verts", "citron"],
      ["citron vert", "citron"],
      // A word the matcher reads on its own stays its own.
      ["poudre d'ail", "gousse d'ail"],
      ["tête d'ail", "poudre d'ail"],
      ["bouillon de poulet", "poulet"],
      ["coriandre moulue", "coriandre"],
      ["graines de coriandre", "cilantro"],
      ["poivre", "poivron"],
      ["pomme", "pomme de terre"],
      ["lait", "lait de coco"],
    ])
  )("%s does not cover %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(false);
  });
});

describe("an egg covers its yolk and its white, one way only", () => {
  // Having eggs, a recipe's "egg yolk" or "egg white" is had (like a lime for its juice and zest);
  // egg whites or yolks in Inventory never make a recipe's eggs had.
  it.each([
    ["egg", "egg yolk"],
    ["egg", "egg white"],
    ["eggs", "egg yolks"],
    ["eggs", "egg whites"],
    ["large eggs", "egg whites"],
    ["egg", "jaune d'œuf"],
    ["egg", "blanc d'œuf"],
    ["eggs", "jaunes d'œufs"],
    ["eggs", "blancs d'œufs"],
    ["œuf", "egg yolk"],
    ["œuf", "egg white"],
    ["œufs", "egg whites"],
    ["œuf", "jaune d'œuf"],
    ["œuf", "blanc d'œuf"],
    ["œufs", "jaunes d'œufs"],
    ["œufs", "blancs d'œufs"],
    ["oeufs", "jaune d'oeuf"],
    ["Œufs", "blanc d'oeuf"],
  ])("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });

  it.each([
    ["egg yolk", "egg"],
    ["egg white", "egg"],
    ["egg yolks", "eggs"],
    ["egg whites", "eggs"],
    ["egg whites", "large eggs"],
    ["jaune d'œuf", "egg"],
    ["blanc d'œuf", "egg"],
    ["jaunes d'œufs", "œufs"],
    ["blancs d'œufs", "œufs"],
    ["jaune d'œuf", "œuf"],
    ["blanc d'œuf", "œuf"],
    ["egg yolk", "œufs"],
    ["egg white", "œuf"],
  ])("%s does not cover %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(false);
  });

  it("a yolk is not a white, and each is the same in both languages", () => {
    for (const [have, ingredient] of both([
      ["egg yolk", "egg white"],
      ["jaune d'œuf", "blanc d'œuf"],
      ["egg yolk", "blanc d'œuf"],
    ])) {
      expect(itemCovers(have, ingredient)).toBe(false);
    }
    for (const [have, ingredient] of both([
      ["egg yolk", "jaune d'œuf"],
      ["egg yolks", "jaunes d'œufs"],
      ["egg white", "blanc d'œuf"],
      ["egg whites", "blancs d'oeufs"],
    ])) {
      expect(itemCovers(have, ingredient)).toBe(true);
    }
  });

  it("white stays a colour anywhere but on an egg: white egg noodles are egg noodles", () => {
    expect(itemCovers("egg noodles", "white egg noodles")).toBe(true);
    expect(itemCovers("white egg noodles", "egg noodles")).toBe(true);
    expect(itemCovers("egg", "egg noodles")).toBe(false);
  });

  it("an egg in Inventory makes a recipe's yolk had, and the recipe's eggs need whites", () => {
    const eggs = { inventory: [{ id: 1, name: "Œufs" }] };
    const whites = { inventory: [{ id: 2, name: "Egg whites" }] };
    expect(ingredientHave("egg yolk", eggs)).toBe("have");
    expect(ingredientHave("blanc d'œuf", eggs)).toBe("have");
    expect(ingredientHave("eggs", whites)).toBe("need");
    expect(ingredientHave("egg white", whites)).toBe("have");
  });
});

describe("an orange pepper is a bell pepper", () => {
  it.each(
    both([
      ["orange pepper", "orange bell pepper"],
      ["poivron orange", "orange bell pepper"],
      ["poivrons orange", "orange bell peppers"],
      ["poivron orange", "orange pepper"],
    ])
  )("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });

  it.each(
    both([
      ["orange pepper", "red pepper"],
      ["poivron orange", "poivron rouge"],
      ["orange", "orange pepper"],
      ["pepper", "orange pepper"],
      ["poivre", "poivron orange"],
    ])
  )("%s does not cover %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(false);
  });

  it("an orange is still an orange: its zest, its juice, its colour as a word", () => {
    expect(itemCovers("orange", "orange zest")).toBe(true);
    expect(itemCovers("orange", "orange juice")).toBe(false);
    expect(itemCovers("oranges", "orange")).toBe(true);
  });
});

// A French name is new to the matcher whenever the table gives it, and it is read as the English
// of its row. The English rules it falls under must not join two different foods: a sausage is
// not a pork chop, « canard » is not duck fat, « tomate cerise » is not a roma tomato. These are
// the pairs that were wrongly "had" before (in French, and for most of them in English too).
describe("a name that is made from an animal, or a variety, stays its own food", () => {
  it.each(
    both([
      // Sausage, bacon, ham, chorizo, prosciutto and pancetta are not pork, nor one another.
      ["saucisse italienne", "côtelette de porc"],
      ["saucisses italiennes", "pork chop"],
      ["saucisse", "filet de porc"],
      ["italian sausage", "pork"],
      ["sausage", "ground pork"],
      ["bacon", "pork chop"],
      ["bacon", "porc"],
      ["jambon", "côtelette de porc"],
      ["ham", "pork tenderloin"],
      ["prosciutto", "pork"],
      ["pancetta", "pork belly"],
      ["chorizo", "pork"],
      ["bacon", "sausage"],
      ["ham", "bacon"],
      ["jambon", "saucisse"],
      ["chorizo", "saucisse italienne"],
      // ...and the animal they are made of only counts when it is not pork.
      ["turkey bacon", "bacon"],
      ["chicken sausage", "sausage"],
      ["turkey ham", "ham"],
      ["bacon", "bacon grease"],
      // A dish, an organ or a fat made from an animal is not the animal.
      ["canard", "duck fat"],
      ["duck", "duck fat"],
      ["crevette", "shrimp salad"],
      ["poulet", "chicken salad"],
      ["poulet", "chicken liver"],
      ["chicken", "chicken soup"],
      ["chicken", "chicken nuggets"],
      ["porc", "pork rinds"],
      ["boeuf", "beef gravy"],
      ["boeuf", "corned beef"],
      ["agneau", "lamb kidney"],
      ["beef", "beef tomatoes"],
      ["oyster", "oyster mushrooms"],
      // A chile pepper is not a jam, a paste, flakes or a dish with chili in its name.
      ["piment fort", "thai chilli jam"],
      ["chili", "chili con carne"],
      ["chili pepper", "chilli flakes"],
      ["chili", "chilli bean paste"],
      ["piment fort", "pâte de piment fort"],
      ["piment fort", "flocons de piment"],
      // A roma tomato is a plum tomato, not a cherry, a grape or a vine one.
      ["tomate cerise", "tomate roma"],
      ["cherry tomato", "roma tomato"],
      ["tomate raisin", "roma tomato"],
      ["grape tomatoes", "tomates roma"],
      ["vine tomatoes", "roma tomato"],
      // Goat cheese is not a goat.
      ["fromage de chèvre", "goat"],
      ["goat cheese", "goat"],
      // « mûre » after a fruit says it is ripe, it is not a blackberry.
      ["cerise mûre", "blackberry"],
      ["cerises mûres", "mûres"],
      ["prune mûre", "blackberry"],
      ["tomate mûre", "mûres"],
      ["banane mûre", "mûres"],
    ])
  )("%s does not cover %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(false);
  });

  it.each(
    both([
      // The same food in the two languages, and the animal on its own for its cuts.
      ["saucisse", "sausage"],
      ["saucisses italiennes", "italian sausage"],
      ["saucisse italienne", "sausage"],
      ["pork sausage", "sausage"],
      ["jambon", "ham"],
      ["canard", "duck"],
      ["canard", "duck breast"],
      ["crevettes", "shrimp"],
      ["porc", "pork chop"],
      ["poulet", "chicken breast"],
      ["boeuf", "ground beef"],
      ["chili", "chili pepper"],
      ["chile pepper", "piment fort"],
      ["chilli flakes", "chili flakes"],
      ["flocons de piment", "crushed red pepper"],
      ["tomate roma", "plum tomato"],
      ["tomate roma", "roma tomatoes"],
      ["tomate", "tomate roma"],
      ["fromage de chèvre", "goat cheese"],
      ["mûres", "blackberries"],
      ["confiture de mûres", "blackberry jam"],
      ["tarte aux mûres", "blackberry pie"],
      ["cerises mûres", "ripe cherries"],
      ["bananes mûres", "ripe bananas"],
    ])
  )("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });
});

// "ripe" (« mûr », « mûre », « mûrs », « mûres ») only describes another food, like "whole" or
// "unsalted": the bananas at home are the "ripe bananas" a recipe asks for, in both languages. On its
// own, or after « de » / « aux », « mûre » is still the blackberry (the must-stay-NO pairs above:
// « cerise mûre » is not a blackberry, « mûres » are not ripe cherries).
describe("ripe is a describing word", () => {
  it.each(
    both([
      ["bananas", "ripe bananas"],
      ["banana", "ripe banana"],
      ["bananes", "bananes mûres"],
      ["banane", "banane mûre"],
      ["bananas", "bananes mûres"],
      ["bananes", "ripe bananas"],
      ["ripe bananas", "bananes mûres"],
      ["tomatoes", "ripe tomatoes"],
      ["tomate", "tomates mûres"],
      ["avocado", "ripe avocados"],
      ["avocat", "avocats mûrs"],
      ["avocats", "avocat mûr"],
      ["mangue", "ripe mango"],
      ["mangue", "mangue mûre"],
      ["cerises", "ripe cherries"],
      ["cerises", "cerises mûres"],
      // The blackberry keeps its name, alone or with « de » / « aux », and "ripe" on it changes nothing.
      ["mûres", "blackberries"],
      ["blackberries", "ripe blackberries"],
      ["confiture de mûres", "blackberry jam"],
    ])
  )("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });

  it("a ripe fruit is still that fruit and no other", () => {
    expect(itemCovers("ripe bananas", "mangue mûre")).toBe(false);
    expect(itemCovers("bananes mûres", "ripe mango")).toBe(false);
    expect(itemCovers("ripe bananas", "blackberries")).toBe(false);
    expect(itemCovers("bananes mûres", "mûres")).toBe(false);
  });

  it("a recipe line with ripe bananas is had with bananas in Inventory (card, Makeable, Planner), both languages", () => {
    const bananas = { inventory: [{ id: 1, name: "Bananes" }] };
    expect(ingredientHave("ripe bananas", bananas)).toBe("have");
    expect(ingredientHave("bananes mûres", bananas)).toBe("have");
    expect(ingredientHave("blackberries", bananas)).toBe("need");
    expect(ingredientHave("mûres", bananas)).toBe("need");
  });
});

// ---- Dried and smoked are their own foods -----------------------------------------------------
//
// Dried and smoked are different products you buy differently: dried apricots are not apricots, and
// smoked salmon is not salmon, in both directions and in both languages. The words that count as dried:
// dried, dehydrated, freeze-dried, sun-dried, « séché(e)(s) » (also « séchées au soleil »),
// « déshydraté(e)(s) » and « lyophilisé(e)(s) »; as smoked: smoked ("hickory-smoked" too) and
// « fumé(e)(s) ». "dry" and « sec » are not read (a dry wine is not a dried food). Cooked, raw, fresh and
// frozen are still describing words. Herbs, spices and the foods only sold dry keep their plain name.
describe("dried and smoked are their own foods", () => {
  it.each(
    both([
      // Dried fruit, vegetables, fish and mushrooms are not the fresh (or frozen) food.
      ["apricots", "dried apricots"],
      ["abricots", "abricots séchés"],
      ["apricots", "abricots séchés"],
      ["abricots", "dried apricots"],
      ["abricot", "abricots déshydratés"],
      ["cranberries", "dried cranberries"],
      ["canneberges", "canneberges séchées"],
      ["mango", "dried mango"],
      ["mangue", "mangue séchée"],
      ["cherries", "dried cherries"],
      ["cerises", "cerises séchées"],
      ["strawberries", "freeze-dried strawberries"],
      ["fraises", "fraises lyophilisées"],
      ["shrimp", "dried shrimp"],
      ["crevettes", "crevettes séchées"],
      ["crevette", "dried shrimp"],
      ["shrimp", "crevettes séchées"],
      ["tomatoes", "dried tomatoes"],
      ["tomatoes", "sun-dried tomatoes"],
      ["tomatoes", "sun dried tomatoes"],
      ["tomates", "tomates séchées"],
      ["tomates", "tomates séchées au soleil"],
      ["tomates", "tomates déshydratées"],
      ["tomatoes", "tomates séchées au soleil"],
      ["mushrooms", "dried mushrooms"],
      ["champignons", "champignons séchés"],
      ["onion", "dried minced onion"],
      ["oignon", "oignon déshydraté"],
      // Dried beans and chickpeas: the bare name could be a can.
      ["chickpeas", "dried chickpeas"],
      ["pois chiches", "pois chiches séchés"],
      ["white beans", "dried white beans"],
      // Smoked fish, meat and tofu are not the plain food.
      ["salmon", "smoked salmon"],
      ["saumon", "saumon fumé"],
      ["salmon", "saumon fumé"],
      ["saumon", "smoked salmon"],
      ["salmon", "cold smoked salmon"],
      ["ham", "smoked ham"],
      ["jambon", "jambon fumé"],
      ["bacon", "smoked bacon"],
      ["bacon", "hickory-smoked bacon"],
      ["sausage", "smoked sausage"],
      ["saucisse", "saucisse fumée"],
      ["turkey", "smoked turkey"],
      ["dinde", "dinde fumée"],
      ["tofu", "smoked tofu"],
      ["tofu", "tofu fumé"],
      // Dried is not smoked.
      ["dried salmon", "smoked salmon"],
      ["saumon séché", "saumon fumé"],
      ["dried tomatoes", "smoked tomatoes"],
    ])
  )("%s does not cover %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(false);
  });

  it.each(
    both([
      // Every way of writing dried is the same food, in both languages.
      ["dried apricots", "dehydrated apricots"],
      ["dried apricots", "abricots séchés"],
      ["dried apricots", "abricots déshydratés"],
      ["abricots séchés", "abricots déshydratés"],
      ["Dried Apricots", "dried apricot"],
      ["dried tomatoes", "sun-dried tomatoes"],
      ["dried tomatoes", "sun dried tomatoes"],
      ["sun-dried tomatoes", "sun dried tomatoes"],
      ["sun-dried tomatoes", "tomates séchées au soleil"],
      ["tomates séchées", "tomates séchées au soleil"],
      ["tomates déshydratées", "dehydrated tomatoes"],
      ["dried tomatoes", "tomates séchées"],
      ["freeze-dried strawberries", "fraises lyophilisées"],
      ["dried mango", "mangue séchée"],
      ["dried shrimp", "crevettes séchées"],
      ["dried mushrooms", "champignons séchés"],
      ["dried cranberries", "canneberges séchées"],
      ["dried chickpeas", "pois chiches séchés"],
      // ...and smoked.
      ["smoked salmon", "saumon fumé"],
      ["smoked salmon", "cold smoked salmon"],
      ["saumon fumé", "saumons fumés"],
      ["smoked bacon", "hickory-smoked bacon"],
      ["smoked ham", "jambon fumé"],
      ["smoked sausage", "saucisse fumée"],
      ["smoked tofu", "tofu fumé"],
      ["smoked turkey", "dinde fumée"],
    ])
  )("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });

  // The edge cases that keep matching, with the reason in each group.
  it.each(
    both([
      // Dried herbs: the jar in the spice rack is the dried one, so "dried oregano" is "oregano".
      ["oregano", "dried oregano"],
      ["origan", "origan séché"],
      ["oregano", "origan séché"],
      ["origan", "dried oregano"],
      ["basil", "dried basil"],
      ["basilic", "basilic séché"],
      ["parsley", "dried parsley"],
      ["persil", "persil séché"],
      ["thyme", "dried thyme"],
      ["thym", "thym séché"],
      ["bay leaves", "dried bay leaves"],
      ["feuilles de laurier", "feuilles de laurier séchées"],
      ["cilantro", "dried cilantro"],
      ["coriandre", "coriandre séchée"],
      ["chili flakes", "dried chili flakes"],
      ["flocons de piment", "flocons de piment séchés"],
      // A ground spice is dry already.
      ["ground mustard", "dried ground mustard"],
      ["moutarde moulue", "dried ground mustard"],
      // Foods only ever sold dry: "dried" only describes the box.
      ["spaghetti", "dried spaghetti"],
      ["pasta", "dried pasta"],
      ["pâtes", "pâtes séchées"],
      ["pâtes", "dried pasta"],
      ["lentils", "dried lentils"],
      ["lentilles", "lentilles séchées"],
      ["egg noodles", "dried egg noodles"],
      ["rice noodles", "dried rice noodles"],
      // Smoked paprika is the paprika in the spice rack (Cook with's "Paprika" finds it).
      ["paprika", "smoked paprika"],
      ["paprika", "paprika fumé"],
      ["paprika", "sweet smoked paprika"],
      ["smoked paprika", "paprika fumé"],
      // Cooked, raw, fresh and frozen are describing words, as they were: raw chicken at home is the
      // recipe's "cooked chicken".
      ["chicken", "cooked chicken"],
      ["poulet", "poulet cuit"],
      ["poulet", "cooked chicken"],
      ["chicken", "poulet cuit"],
      ["rice", "cooked rice"],
      ["riz", "riz cuit"],
      ["shrimp", "cooked shrimp"],
      ["crevettes", "crevettes cuites"],
      ["tomatoes", "fresh tomatoes"],
      ["peas", "frozen peas"],
      ["pois", "pois surgelés"],
    ])
  )("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });

  it("is a different line, a different ✓ and a different Cook with pick", () => {
    const fresh = { inventory: [{ name: "Abricots" }] };
    const dried = { inventory: [{ name: "Abricots séchés" }] };
    expect(ingredientHave("apricots", fresh)).toBe("have");
    expect(ingredientHave("dried apricots", fresh)).toBe("need");
    expect(ingredientHave("apricots", dried)).toBe("need");
    expect(ingredientHave("dried apricots", dried)).toBe("have");
    expect(ingredientHave("smoked salmon", { inventory: [{ name: "Salmon" }] })).toBe("need");
    expect(ingredientHave("salmon", { inventory: [{ name: "Saumon fumé" }] })).toBe("need");
    // A recipe with both is two lines, each had or missing on its own.
    const bake = { id: "bake", ingredients: [{ name: "apricots" }, { name: "dried apricots" }] };
    expect(recipeLines(bake, fresh).map((l) => [l.name, l.had])).toEqual([["Apricots", true], ["Dried apricots", false]]);
    expect(recipeHave(bake, dried)).toMatchObject({ totalCount: 2, matchedCount: 1, missing: ["Apricots"] });
    // A pick finds the recipes that use that food and not the other one.
    expect(recipeUsesItem({ ingredients: [{ name: "dried apricots" }] }, "Abricots")).toBe(false);
    expect(recipeUsesItem({ ingredients: [{ name: "dried apricots" }] }, "Abricots séchés")).toBe(true);
    expect(foodKey("apricots")).not.toBe(foodKey("dried apricots"));
    expect(foodKey("abricots séchés")).toBe(foodKey("dried apricots"));
    expect(foodKey("saumon fumé")).toBe(foodKey("smoked salmon"));
    expect(foodKey("oregano")).toBe(foodKey("dried oregano"));
    // The finished view's take-out list does not take the fresh item for the dried ingredient.
    const rows = buildTakeOut({ recipe: { ingredients: [{ name: "dried apricots", quantity: 1, unit: "cup" }] }, servings: 1, inventory: [{ id: 1, name: "Abricots", quantity: 2, unit: "cup" }] });
    expect(rows).toMatchObject([{ kind: "missing" }]);
    const mixed = buildTakeOut({ recipe: { ingredients: [{ name: "apricots" }, { name: "dried apricots" }] }, servings: 1, inventory: [] });
    expect(mixed.map((r) => r.kind)).toEqual(["missing", "missing"]);
  });

  it("does not read dry or « sec » as dried, and keeps a bare word from being a food", () => {
    expect(itemCovers("white wine", "dry white wine")).toBe(false);
    expect(itemCovers("dried", "dried")).toBe(false);
    expect(itemCovers("smoked", "fumé")).toBe(false);
  });

  // The names table lists the herbs once, under "# Herbs": every one of them keeps its plain name, in both
  // languages, so a herb added there later does not quietly become a different food when dried.
  it("keeps every herb of the names table (English and French) the same when dried", () => {
    const text = readFileSync(new URL("./ingredientDisplay.txt", import.meta.url), "utf8");
    const section = text.split("\n# Herbs\n")[1].split("\n# Fruit\n")[0];
    const rows = section.split("\n").filter((line) => line.includes("|")).map((line) => line.split("|").map((cell) => cell.trim().split("/")[0]));
    expect(rows.length).toBeGreaterThan(10);
    for (const [english, , french] of rows) {
      expect(itemCovers(english, `dried ${english}`), `${english} / dried ${english}`).toBe(true);
      expect(itemCovers(`dried ${english}`, english), `dried ${english} / ${english}`).toBe(true);
      expect(itemCovers(french, `${french} séché`), `${french} / ${french} séché`).toBe(true);
      expect(itemCovers(`${french} séché`, english), `${french} séché / ${english}`).toBe(true);
    }
  });
});

// ---- Mustard powder is one food, and never prepared mustard ------------------------------------
//
// The spice in the spice rack is written many ways, in both languages, and they all match each other. Prepared
// mustard (Dijon, yellow, the plain jar) is another food: neither covers the other.
describe("mustard powder is one food, and never prepared mustard", () => {
  const POWDER = [
    "dried mustard",
    "dry mustard",
    "ground mustard",
    "dried ground mustard",
    "mustard powder",
    "dry mustard powder",
    "powdered mustard",
    "moutarde sèche",
    "moutarde séchée",
    "moutarde en poudre",
    "moutarde moulue",
    "poudre de moutarde",
    "Dry Mustard",
    "Ground Mustard",
  ];
  const PREPARED = ["mustard", "moutarde", "dijon mustard", "moutarde de Dijon", "yellow mustard", "moutarde jaune", "honey mustard", "English mustard"];

  it.each(POWDER.flatMap((a) => POWDER.filter((b) => b !== a).map((b) => [a, b])))("%s covers %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(true);
  });

  it.each(both(POWDER.flatMap((a) => PREPARED.map((b) => [a, b]))))("%s does not cover %s", (have, ingredient) => {
    expect(itemCovers(have, ingredient)).toBe(false);
  });

  it("is not mustard seed, and a prepared mustard line is not had with the powder", () => {
    for (const [have, ingredient] of both([
      ["mustard seeds", "mustard powder"],
      ["graines de moutarde", "moutarde en poudre"],
      ["mustard seeds", "ground mustard"],
    ])) {
      expect(itemCovers(have, ingredient)).toBe(false);
    }
    expect(ingredientHave("dijon mustard", { inventory: [{ name: "Moutarde sèche" }] })).toBe("need");
    expect(ingredientHave("dry mustard", { inventory: [{ name: "Moutarde de Dijon" }] })).toBe("need");
    expect(ingredientHave("dry mustard", { inventory: [{ name: "Moutarde en poudre" }] })).toBe("have");
    expect(foodKey("moutarde sèche")).toBe(foodKey("mustard powder"));
    expect(foodKey("mustard")).not.toBe(foodKey("ground mustard"));
  });
});
