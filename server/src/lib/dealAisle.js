// The grocery-store aisle a flyer item belongs to, for the Flyers table's
// "By category" view. Worked out from the item's name (English or French)
// when deals are served, so every deal - whatever imported it - is grouped
// the same way. The first rule that matches wins, so the specific ones
// ("chicken broth" is pantry, "frozen pizza" is frozen) come first.

export const AISLES = [
  { id: "produce", label: "Fruits & vegetables" },
  { id: "meat", label: "Meat & poultry" },
  { id: "seafood", label: "Fish & seafood" },
  { id: "dairy", label: "Dairy & eggs" },
  { id: "deli", label: "Deli & ready meals" },
  { id: "bakery", label: "Bakery" },
  { id: "frozen", label: "Frozen" },
  { id: "pantry", label: "Pantry" },
  { id: "snacks", label: "Snacks & sweets" },
  { id: "drinks", label: "Drinks" },
  { id: "household", label: "Household & personal care" },
  { id: "other", label: "Other" },
];

const RULES = [
  // Cooking ingredients whose names say "juice", "milk", "pepper" or
  // "ground" but live in the pantry aisle.
  ["pantry", /\b(lemon juice|lime juice|jus de (citron|lime)|vinegar|vinaigre|cooking wine|vin de cuisine|coconut milk|lait de coco|condensed milk|evaporated milk|lait concentr[eé]|(black|white|ground|cracked) pepper|poivre|peppercorns?|paprika|cumin|cinnamon|cannelle|oregano|origan|chil[ei] powder|garlic powder|onion powder|curry powder|nutmeg|muscade|turmeric|curcuma|cayenne|(red )?pepper flakes|chil[ei] flakes|bay leaf|bay leaves|laurier|vanilla|vanille|baking soda|baking powder|bicarbonate|levure|yeast|cornstarch|f[eé]cule|bouillon cubes?|broth|stock)\b/i],
  ["household", /\b(paper towels?|essuie-tout|toilet paper|papier hygi[eé]nique|tissues?|mouchoirs?|detergent|d[eé]tersif|dish soap|savon|soap|shampo+ing|shampoo|conditioner|revitalisant|toothpaste|dentifrice|deodorant|d[eé]odorant|diapers?|couches?|wipes|lingettes|garbage bags?|sacs? (à|a) ordures|aluminum foil|papier d'aluminium|plastic wrap|batter(y|ies)|piles|bleach|javel|cleaner|nettoyant|razors?|rasoirs?|lotion|cosmetics?|vitamins?|pet food|nourriture pour (chats?|chiens?)|cat food|dog food|litter|liti[eè]re|light bulbs?|ampoules?)\b/i],
  // Fish named after something else: Blue Water's breaded fillets aren't
  // water, High Liner's fish & chips aren't snacks.
  ["seafood", /\b(fish sticks?|fish fillets?|fish & chips|fish and chips|filets? de poissons?|b[aâ]tonnets de poissons?|poissons? pan[eé]s?|blue water|high liner)\b/i],
  // "Drumstick" is also a Nestlé ice-cream cone.
  ["frozen", /\b(friandises glac[eé]es|frozen treats|ice cream cones?|drumstick ou friandises|drumstick cones?)\b/i],
  ["frozen", /\b(frozen|surgel[eé]e?s?|congel[eé]e?s?|ice cream|cr[eè]me glac[eé]e|gelato|sorbet|popsicles?|frozen pizza|frites surgel[eé]es|superfries|waffles? frozen)\b/i],
  ["drinks", /\b(juice|jus|soda|soft drinks?|boissons? gazeuses?|cola|pepsi|coca-cola|sparkling water|eau p[eé]tillante|(?<!blue )water|eau|kombucha|iced tea|th[eé] glac[eé]|energy drinks?|beer|bi[eè]re|wine|vin|cider|cidre|lemonade|limonade|sports? drinks?|gatorade)\b/i],
  ["pantry", /\b(broth|bouillon|stock|soups?|soupes?|sauces?|ketchup|mustard|moutarde|mayo(nnaise)?|vinaigrette|dressing|salsa|peanut butter|beurre d'arachide|jam|confiture|honey|miel|maple syrup|sirop d'[eé]rable|syrup|sirop|oil|huile|vinegar|vinaigre|flour|farine|sugar|sucre|baking|rice|riz|pasta|p[aâ]tes|spaghetti|macaroni|noodles?|nouilles|cereals?|c[eé]r[eé]ales|oats|avoine|granola|canned|en conserve|conserves?|beans|haricots|lentils|lentilles|chickpeas|pois chiches|tomato paste|p[aâ]te de tomates|spices?|[eé]pices|salt|sel|pepper sauce|coffee|caf[eé]|tea|th[eé]|nuts?|noix|almonds?|amandes)\b/i],
  ["snacks", /\b(chips|croustilles|crackers?|biscuits?|cookies?|chocolate|chocolat|candy|bonbons?|gummies|jujubes|popcorn|ma[iï]s souffl[eé]|pretzels?|bretzels|granola bars?|barres?|snacks?|collations?|dessert)\b/i],
  ["deli", /\b(deli|charcuterie|salami|pepperoni|prosciutto|sliced (ham|turkey|chicken)|tranch[eé]|cold cuts|pr[eê]t-[aà]-manger|ready meals?|rotisserie|r[oô]ti cuit|hummus|houmous|dips?|trempettes?|sushi|pizza|lasagn[ae]|quiche|tourti[eè]re|p[aâ]t[eé]s?)\b/i],
  ["seafood", /\b(salmon|saumon|tuna|thon|shrimps?|crevettes?|cod|morue|tilapia|haddock|aiglefin|trout|truite|halibut|fl[eé]tan|sole|scallops?|p[eé]toncles?|mussels?|moules|lobster|homard|crab|crabe|fish|poissons?|seafood|fruits de mer|sardines?|mackerel|maquereau|basa)\b/i],
  ["meat", /\b(chicken|poulet|beef|b(oe|œ)uf|pork|porc|ham|jambon|bacon|sausages?|saucisses?|turkey|dinde|lamb|agneau|veal|veau|steaks?|roast|r[oô]ti|ground|hach[eé]|ribs?|c[oô]tes|wings?|ailes|drumsticks?|pilons?|thighs?|hauts de cuisse|breasts?|poitrines?|chops?|tenderloin|filet mignon|meatballs?|boulettes|hot dogs?|wieners?)\b/i],
  ["dairy", /\b(milk|lait|cheese|fromages?|cheddar|mozzarella|brie|feta|parmesan|yogh?urt|yogourt|butter|beurre|cream|cr[eè]me|sour cream|cottage|kefir|eggs?|oeufs?|œufs?|margarine)\b/i],
  ["bakery", /\b(bread|pain|bagels?|baguettes?|buns?|croissants?|chocolatines?|muffins?|tortillas?|wraps?|pitas?|naan|cakes?|g[aâ]teaux?|pies?|tartes?|danishes|brioche|english muffins?)\b/i],
  ["produce", /\b(apples?|pommes?|bananas?|bananes?|oranges?|clementines?|cl[eé]mentines?|mandarins?|mandarines?|lemons?|citrons?|limes?|grapes?|raisins?|berries|fraises?|strawberr(y|ies)|blueberr(y|ies)|bleuets?|raspberr(y|ies)|framboises?|melons?|cantaloupes?|watermelons?|past[eè]ques?|pears?|poires?|peach(es)?|p[eê]ches?|nectarines?|plums?|prunes?|cherr(y|ies)|cerises?|kiwis?|mangoes?|mangues?|pineapples?|ananas|avocados?|avocats?|tomato(es)?|tomates?|potato(es)?|patates?|pommes de terre|onions?|oignons?|carrots?|carottes?|lettuce|laitues?|romaine|spinach|[eé]pinards|kale|broccoli|brocoli|cauliflower|chou-fleur|cabbage|chou|peppers?|poivrons?|cucumbers?|concombres?|mushrooms?|champignons?|celery|c[eé]leri|zucchini|courgettes?|squash|courges?|garlic|ail|corn|ma[iï]s|asparagus|asperges|green beans|haricots verts|herbs?|cilantro|coriandre|parsley|persil|basil|basilic|sweet potato(es)?|patates douces|beets?|betteraves?|radish(es)?|radis|leeks?|poireaux?|eggplants?|aubergines?|peas|pois|snow peas|scallions?|green onions?|shallots?|[eé]chalotes?|ginger|gingembre|jalap[eé]nos?|chil[ei] peppers?|piments?|thyme|thym|rosemary|romarin|mint|menthe|dill|aneth|sage|sauge|arugula|roquette|bok choy|sprouts|pousses|fennel|fenouil|turnips?|navets?|parsnips?|panais|rutabaga|plantains?|cranberr(y|ies)|canneberges|figs?|figues|pomegranates?|grenades?|papayas?|limes?)\b/i],
];

// Categories the importers stored, for an item no rule recognizes.
const FROM_STORED = { protein: "meat", produce: "produce", dairy: "dairy", bakery: "bakery", staple: "pantry" };

export function aisleFor(deal) {
  const text = `${deal.item || ""} ${deal.matchName || ""}`;
  for (const [aisle, re] of RULES) if (re.test(text)) return aisle;
  return FROM_STORED[deal.category] || "other";
}
