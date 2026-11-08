// What a new account starts with: example recipes, a planned week and a stocked Inventory, all
// tagged « Exemple » and removable in one tap (lib/examples.js builds and removes them). This
// file is ALL of the content, so the examples are changed here and nowhere else.
//
// Written fresh for the app (never copied from a recipe site), in both languages. A recipe's
// title, notes and steps, and an Inventory item's name, are `{ fr, en }`, and the examples are
// created in the account's language (signup, and « Ajouter des exemples »).
//
// An ingredient LINE (its name and its prep note) is `{ fr, en }` too, each spelling being one the
// ingredient names table knows (client/src/lib/ingredientDisplay.txt): the recipe is made in the
// account's language so Cook mode finds an ingredient in the steps (its "For this step" only knows
// a few names across languages), and it is still shown through the table in whichever language
// the app is switched to later, as every recipe's ingredients are. exampleContent.test.js fails
// when a spelling is not in the table or the two are not the same ingredient to it. Amounts use
// the app's own unit ids (client/src/lib/units.js); a plain count has no unit.
//
// Days are "days from the day the account is created", counted in Quebec days.

// The recipe's picture: a small illustration drawn for the app, in client/public/examples/.
export const examplePhoto = (slug) => `/examples/${slug}.svg`;

export const EXAMPLE_RECIPES = [
  {
    slug: "pate-chinois",
    title: { fr: "Pâté chinois", en: "Pâté chinois (Quebec shepherd's pie)" },
    notes: { fr: "Se garde 4 jours au frigo et se congèle très bien.", en: "Keeps 4 days in the fridge and freezes very well." },
    servings: 6,
    prep: 30,
    cook: 45,
    fridgeLifeDays: 4,
    mealSlots: ["dinner"],
    ingredients: [
      { name: { fr: "bœuf haché", en: "ground beef" }, quantity: 500, unit: "g" },
      { name: { fr: "oignon", en: "onion" }, quantity: 1, notes: { fr: "haché", en: "chopped" } },
      { name: { fr: "maïs", en: "corn" }, quantity: 1, unit: "can", notes: { fr: "égoutté", en: "drained" } },
      { name: { fr: "pommes de terre", en: "potatoes" }, quantity: 900, unit: "g", notes: { fr: "pelées", en: "peeled" } },
      { name: { fr: "lait", en: "milk" }, quantity: 60, unit: "ml" },
    ],
    steps: {
      fr: [
        "Couvrir les pommes de terre d'eau salée, porter à ébullition et cuire de 15 à 20 minutes, jusqu'à ce qu'elles soient tendres.",
        "Pendant ce temps, faire revenir l'oignon dans une poêle à feu moyen, puis ajouter le bœuf haché et le cuire en l'égrenant jusqu'à ce qu'il ne soit plus rosé. Saler et poivrer.",
        "Égoutter les pommes de terre et les écraser avec le lait jusqu'à l'obtention d'une purée lisse.",
        "Étaler le bœuf dans un plat allant au four, couvrir du maïs, puis de la purée.",
        "Cuire au four à 190 °C (375 °F) environ 20 minutes, puis faire dorer 2 minutes sous le gril.",
      ],
      en: [
        "Cover the potatoes with salted water, bring to a boil and cook for 15 to 20 minutes, until tender.",
        "Meanwhile, soften the onion in a skillet over medium heat, then add the ground beef and cook it, breaking it up, until it is no longer pink. Season with salt and pepper.",
        "Drain the potatoes and mash them with the milk until smooth.",
        "Spread the beef in a baking dish, cover with the corn, then the mashed potatoes.",
        "Bake at 375 °F (190 °C) for about 20 minutes, then broil for 2 minutes to brown the top.",
      ],
    },
  },
  {
    slug: "soupe-aux-pois",
    title: { fr: "Soupe aux pois et au jambon", en: "Split pea and ham soup" },
    notes: { fr: "Se congèle bien en portions individuelles.", en: "Freezes well in single portions." },
    servings: 8,
    prep: 20,
    cook: 90,
    fridgeLifeDays: 5,
    mealSlots: ["lunch", "dinner"],
    ingredients: [
      { name: { fr: "pois cassés", en: "split peas" }, quantity: 500, unit: "g", notes: { fr: "rincés", en: "rinsed" } },
      { name: { fr: "jambon", en: "ham" }, quantity: 300, unit: "g", notes: { fr: "coupé en dés", en: "diced" } },
      { name: { fr: "carottes", en: "carrots" }, quantity: 3, notes: { fr: "coupées en dés", en: "diced" } },
      { name: { fr: "oignon", en: "onion" }, quantity: 1, notes: { fr: "haché", en: "chopped" } },
      { name: { fr: "céleri", en: "celery" }, quantity: 2, unit: "stalk", notes: { fr: "tranché", en: "sliced" } },
      { name: { fr: "bouillon de poulet", en: "chicken broth" }, quantity: 2, unit: "l" },
      { name: { fr: "feuille de laurier", en: "bay leaf" }, quantity: 1 },
    ],
    steps: {
      fr: [
        "Mettre les pois cassés, le bouillon, l'oignon, les carottes, le céleri et la feuille de laurier dans une grande casserole.",
        "Porter à ébullition, puis laisser mijoter à feu doux environ 1 h 15, en remuant de temps à autre, jusqu'à ce que les pois fondent.",
        "Ajouter le jambon et poursuivre la cuisson 10 minutes. Retirer la feuille de laurier, poivrer et rectifier l'assaisonnement.",
      ],
      en: [
        "Put the split peas, broth, onion, carrots, celery and bay leaf in a large pot.",
        "Bring to a boil, then simmer over low heat for about 1 hour 15 minutes, stirring now and then, until the peas break down.",
        "Add the ham and cook for 10 more minutes. Remove the bay leaf, add pepper and adjust the seasoning.",
      ],
    },
  },
  {
    slug: "poulet-sur-plaque",
    title: { fr: "Poulet et légumes sur plaque", en: "Sheet-pan chicken and vegetables" },
    notes: { fr: "Une seule plaque, presque aucune vaisselle.", en: "One pan, hardly any dishes." },
    servings: 4,
    prep: 15,
    cook: 40,
    fridgeLifeDays: 3,
    mealSlots: ["dinner"],
    ingredients: [
      { name: { fr: "hauts de cuisse de poulet", en: "chicken thighs" }, quantity: 8 },
      { name: { fr: "pommes de terre", en: "potatoes" }, quantity: 600, unit: "g", notes: { fr: "coupées en quartiers", en: "quartered" } },
      { name: { fr: "carottes", en: "carrots" }, quantity: 3, notes: { fr: "tranchées", en: "sliced" } },
      { name: { fr: "huile d'olive", en: "olive oil" }, quantity: 2, unit: "tbsp" },
      { name: { fr: "paprika", en: "paprika" }, quantity: 2, unit: "tsp" },
    ],
    steps: {
      fr: [
        "Préchauffer le four à 220 °C (425 °F).",
        "Étaler les pommes de terre et les carottes sur une plaque, arroser de la moitié de l'huile, saler et poivrer.",
        "Frotter les hauts de cuisse avec le reste de l'huile et le paprika, puis les déposer sur les légumes, peau vers le haut.",
        "Cuire de 35 à 40 minutes, jusqu'à ce que la peau soit dorée et que le poulet atteigne 74 °C (165 °F).",
      ],
      en: [
        "Preheat the oven to 425 °F (220 °C).",
        "Spread the potatoes and carrots on a baking sheet, drizzle with half the oil, then add salt and pepper.",
        "Rub the chicken thighs with the rest of the oil and the paprika, then set them on the vegetables, skin side up.",
        "Bake for 35 to 40 minutes, until the skin is golden and the chicken reaches 165 °F (74 °C).",
      ],
    },
  },
  {
    slug: "spaghetti-sauce-viande",
    title: { fr: "Spaghetti sauce à la viande", en: "Spaghetti with meat sauce" },
    notes: { fr: "La sauce est encore meilleure le lendemain.", en: "The sauce is even better the next day." },
    servings: 4,
    prep: 10,
    cook: 35,
    fridgeLifeDays: 4,
    mealSlots: ["dinner"],
    ingredients: [
      { name: { fr: "spaghetti", en: "spaghetti" }, quantity: 400, unit: "g" },
      { name: { fr: "bœuf haché", en: "ground beef" }, quantity: 450, unit: "g" },
      { name: { fr: "oignon", en: "onion" }, quantity: 1, notes: { fr: "haché", en: "chopped" } },
      { name: { fr: "ail", en: "garlic" }, quantity: 2, unit: "clove", notes: { fr: "haché finement", en: "minced" } },
      { name: { fr: "tomates concassées", en: "crushed tomatoes" }, quantity: 1, unit: "can" },
      { name: { fr: "origan", en: "oregano" }, quantity: 1, unit: "tsp" },
    ],
    steps: {
      fr: [
        "Faire revenir l'oignon dans une grande poêle, puis ajouter le bœuf haché et le cuire en l'égrenant jusqu'à ce qu'il soit bien doré.",
        "Ajouter l'ail et l'origan, cuire 1 minute, puis verser les tomates concassées. Laisser mijoter à feu doux 20 minutes. Saler et poivrer.",
        "Pendant ce temps, cuire le spaghetti dans l'eau bouillante salée selon les indications de l'emballage, puis l'égoutter.",
        "Servir le spaghetti nappé de sauce.",
      ],
      en: [
        "Soften the onion in a large skillet, then add the ground beef and cook it, breaking it up, until well browned.",
        "Add the garlic and oregano, cook for 1 minute, then pour in the crushed tomatoes. Simmer over low heat for 20 minutes. Season with salt and pepper.",
        "Meanwhile, cook the spaghetti in boiling salted water as the package says, then drain it.",
        "Serve the spaghetti topped with the sauce.",
      ],
    },
  },
  {
    slug: "gruau-du-soir",
    title: { fr: "Gruau du soir aux bleuets", en: "Blueberry overnight oats" },
    notes: { fr: "Se prépare la veille: 5 minutes le soir, rien à faire le matin.", en: "Make it the night before: 5 minutes in the evening, nothing to do in the morning." },
    servings: 2,
    prep: 5,
    cook: null,
    fridgeLifeDays: 3,
    mealSlots: ["breakfast"],
    ingredients: [
      { name: { fr: "flocons d'avoine", en: "rolled oats" }, quantity: 1, unit: "cup" },
      { name: { fr: "lait", en: "milk" }, quantity: 250, unit: "ml" },
      { name: { fr: "bleuets surgelés", en: "frozen blueberries" }, quantity: 150, unit: "g" },
      { name: { fr: "sirop d'érable", en: "maple syrup" }, quantity: 2, unit: "tbsp" },
    ],
    steps: {
      fr: [
        "Dans deux pots, mélanger les flocons d'avoine, le lait et le sirop d'érable.",
        "Ajouter les bleuets, couvrir et réfrigérer toute la nuit.",
        "Servir froid, ou réchauffer 1 minute au micro-ondes.",
      ],
      en: [
        "In two jars, stir together the oats, milk and maple syrup.",
        "Add the blueberries, cover and refrigerate overnight.",
        "Serve cold, or warm for 1 minute in the microwave.",
      ],
    },
  },
  {
    slug: "omelette-cheddar",
    title: { fr: "Omelette au cheddar", en: "Cheddar omelette" },
    notes: { fr: "Prête en 10 minutes: pratique quand on est pressé.", en: "Ready in 10 minutes: handy when you are in a hurry." },
    servings: 1,
    prep: 3,
    cook: 7,
    fridgeLifeDays: null,
    mealSlots: ["breakfast", "lunch"],
    ingredients: [
      { name: { fr: "œufs", en: "eggs" }, quantity: 3 },
      { name: { fr: "cheddar", en: "cheddar" }, quantity: 50, unit: "g", notes: { fr: "râpé", en: "grated" } },
      { name: { fr: "huile d'olive", en: "olive oil" }, quantity: 1, unit: "tsp" },
    ],
    steps: {
      fr: [
        "Battre les œufs avec une pincée de sel et de poivre.",
        "Chauffer l'huile dans une poêle antiadhésive à feu moyen, verser les œufs et cuire sans remuer 2 à 3 minutes.",
        "Parsemer de cheddar, plier l'omelette en deux et laisser fondre le fromage 1 minute.",
      ],
      en: [
        "Beat the eggs with a pinch of salt and pepper.",
        "Heat the oil in a non-stick skillet over medium heat, pour in the eggs and cook without stirring for 2 to 3 minutes.",
        "Sprinkle with the cheddar, fold the omelette in half and let the cheese melt for 1 minute.",
      ],
    },
  },
  {
    slug: "salade-pois-chiches",
    title: { fr: "Salade de pois chiches et concombre", en: "Chickpea and cucumber salad" },
    notes: { fr: "Aucune cuisson, et elle se garde 2 jours au frigo.", en: "No cooking, and it keeps 2 days in the fridge." },
    servings: 2,
    prep: 10,
    cook: null,
    fridgeLifeDays: 2,
    mealSlots: ["lunch"],
    ingredients: [
      { name: { fr: "pois chiches", en: "chickpeas" }, quantity: 1, unit: "can", notes: { fr: "rincés et égouttés", en: "rinsed and drained" } },
      { name: { fr: "concombre", en: "cucumber" }, quantity: 1, notes: { fr: "coupé en dés", en: "diced" } },
      { name: { fr: "feta", en: "feta" }, quantity: 100, unit: "g", notes: { fr: "émiettée", en: "crumbled" } },
      { name: { fr: "citron", en: "lemon" }, quantity: 1 },
      { name: { fr: "huile d'olive", en: "olive oil" }, quantity: 2, unit: "tbsp" },
    ],
    steps: {
      fr: [
        "Mélanger les pois chiches, le concombre et la feta dans un saladier.",
        "Presser le citron sur la salade, ajouter l'huile, saler et poivrer, puis bien mélanger.",
        "Servir tout de suite, ou laisser reposer 15 minutes au frigo pour que les saveurs se mêlent.",
      ],
      en: [
        "Mix the chickpeas, cucumber and feta in a bowl.",
        "Squeeze the lemon over the salad, add the oil, season with salt and pepper, then toss well.",
        "Serve right away, or let it rest in the fridge for 15 minutes so the flavours blend.",
      ],
    },
  },
  {
    slug: "lasagne-surgelee",
    title: { fr: "Lasagne surgelée", en: "Frozen lasagna" },
    notes: { fr: "Un plat préparé: rien à cuisiner, juste à réchauffer.", en: "A prepared meal: nothing to cook, just reheat." },
    servings: 4,
    prep: null,
    cook: 55,
    fridgeLifeDays: null,
    mealSlots: ["dinner"],
    isPrepared: true,
    ingredients: [{ name: { fr: "lasagne surgelée", en: "frozen lasagna" }, quantity: 1, unit: "box" }],
    steps: {
      fr: ["Réchauffer au four selon les indications de la boîte, puis laisser reposer 5 minutes avant de servir."],
      en: ["Reheat in the oven as the box says, then let it rest for 5 minutes before serving."],
    },
  },
];

// The planned week: `day` is days from the day the account is created (0 = that day), `meal` is
// breakfast, lunch or dinner (the supper). `leftover` marks a meal that eats what another one made.
export const EXAMPLE_PLAN = [
  { day: 0, meal: "dinner", recipe: "poulet-sur-plaque" },
  { day: 1, meal: "breakfast", recipe: "gruau-du-soir" },
  { day: 1, meal: "lunch", recipe: "soupe-aux-pois" },
  { day: 1, meal: "dinner", recipe: "pate-chinois" },
  { day: 2, meal: "lunch", recipe: "pate-chinois", leftover: true },
  { day: 3, meal: "dinner", recipe: "spaghetti-sauce-viande" },
];

// The stocked Inventory. `kept` is where it is kept (fridge, freezer or pantry; the shelf follows
// from it, and a prepared meal sits on Prepared meals); `days` is the use-by, in days from the day
// the account is created: one item is close (milk, 2 days) so "Use it up" has something to show.
export const EXAMPLE_ITEMS = [
  { name: { fr: "Lait", en: "Milk" }, quantity: 1, unit: "l", kept: "fridge", category: "Dairy Products & Eggs", days: 2 },
  { name: { fr: "Œufs", en: "Eggs" }, quantity: 12, unit: null, kept: "fridge", category: "Dairy Products & Eggs", days: 14 },
  { name: { fr: "Cheddar", en: "Cheddar" }, quantity: 250, unit: "g", kept: "fridge", category: "Dairy Products & Eggs", days: 30 },
  { name: { fr: "Carottes", en: "Carrots" }, quantity: 1, unit: "kg", kept: "fridge", category: "Produce", days: 20 },
  { name: { fr: "Bœuf haché", en: "Ground beef" }, quantity: 500, unit: "g", kept: "freezer", category: "Meat", days: 75 },
  { name: { fr: "Bleuets surgelés", en: "Frozen blueberries" }, quantity: 300, unit: "g", kept: "freezer", category: "Food Purchased Frozen", days: 150 },
  { name: { fr: "Lasagne surgelée", en: "Frozen lasagna" }, quantity: 1, unit: "box", kept: "freezer", category: "Food Purchased Frozen", days: 60, prepared: true },
  { name: { fr: "Pommes de terre", en: "Potatoes" }, quantity: 2, unit: "kg", kept: "pantry", category: "Produce", days: 21 },
  { name: { fr: "Flocons d'avoine", en: "Rolled oats" }, quantity: 1, unit: "kg", kept: "pantry", category: "Grains, Beans & Pasta", days: 240 },
  { name: { fr: "Spaghetti", en: "Spaghetti" }, quantity: 450, unit: "g", kept: "pantry", category: "Grains, Beans & Pasta", days: 365 },
  { name: { fr: "Sirop d'érable", en: "Maple syrup" }, quantity: 540, unit: "ml", kept: "pantry", category: "Condiments, Sauces & Canned Goods", days: 365 },
  { name: { fr: "Huile d'olive", en: "Olive oil" }, quantity: 500, unit: "ml", kept: "pantry", category: "Condiments, Sauces & Canned Goods", days: 300 },
];
