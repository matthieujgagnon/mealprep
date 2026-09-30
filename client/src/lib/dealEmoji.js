// A food emoji for a flyer item that has no photo (or whose photo won't
// load): the most specific word match, else its category's.
const WORDS = [
  [/\b(chicken|poulet|turkey|dinde|wings?)\b/, "🍗"],
  [/\b(beef|b(?:oe|œ)uf|steak|veal|veau|lamb|agneau|roast|rôti)\b/, "🥩"],
  [/\b(pork|porc|ham|jambon|bacon|ribs?|côtes)\b/, "🥓"],
  [/\b(sausages?|saucisses?|hot ?dogs?|wieners?)\b/, "🌭"],
  [/\b(salmon|saumon|tuna|thon|cod|morue|tilapia|haddock|fish|poisson|trout|truite)\b/, "🐟"],
  [/\b(shrimps?|crevettes?|lobster|homard|crab|crabe|mussels?|moules?|scallops?)\b/, "🦐"],
  [/\b(eggs?|oeufs?|œufs?)\b/, "🥚"],
  [/\b(milk|lait|cream|crème|creme)\b/, "🥛"],
  [/\b(cheese|fromage|cheddar|mozzarella|brie|feta|parmesan)\b/, "🧀"],
  [/\b(butter|beurre)\b/, "🧈"],
  [/\b(yogh?urt|yogourt)\b/, "🥣"],
  [/\b(bread|pain|baguette|buns?|bagels?|toast)\b/, "🍞"],
  [/\b(croissants?|pastr(?:y|ies)|viennoiseries?)\b/, "🥐"],
  [/\b(apples?|pommes?)\b(?! de terre)/, "🍎"],
  [/\b(bananas?|bananes?)\b/, "🍌"],
  [/\b(oranges?|clementines?|clémentines?|mandarins?|mandarines?)\b/, "🍊"],
  [/\b(lemons?|citrons?|limes?)\b/, "🍋"],
  [/\b(grapes?|raisins?)\b/, "🍇"],
  [/\b(strawberr(?:y|ies)|fraises?)\b/, "🍓"],
  [/\b(blueberr(?:y|ies)|bleuets?|raspberr(?:y|ies)|framboises?)\b/, "🫐"],
  [/\b(pears?|poires?)\b/, "🍐"],
  [/\b(peach(?:es)?|pêches?|nectarines?)\b/, "🍑"],
  [/\b(cherr(?:y|ies)|cerises?)\b/, "🍒"],
  [/\b(melons?|cantaloupes?|watermelons?|pastèques?)\b/, "🍈"],
  [/\b(pineapples?|ananas)\b/, "🍍"],
  [/\b(mangos?|mangoes|mangues?)\b/, "🥭"],
  [/\b(avocados?|avocats?)\b/, "🥑"],
  [/\b(tomato(?:es)?|tomates?)\b/, "🍅"],
  [/\b(potato(?:es)?|patates?|pommes de terre)\b/, "🥔"],
  [/\b(carrots?|carottes?)\b/, "🥕"],
  [/\b(broccoli|brocoli)\b/, "🥦"],
  [/\b(lettuce|laitues?|romaine|salad|salade|spinach|épinards|kale)\b/, "🥬"],
  [/\b(peppers?|poivrons?)\b/, "🫑"],
  [/\b(cucumbers?|concombres?)\b/, "🥒"],
  [/\b(onions?|oignons?)\b/, "🧅"],
  [/\b(garlic|ail)\b/, "🧄"],
  [/\b(mushrooms?|champignons?)\b/, "🍄"],
  [/\b(corn|maïs)\b/, "🌽"],
  [/\b(rice|riz)\b/, "🍚"],
  [/\b(pasta|pâtes|spaghetti|penne|noodles?|nouilles)\b/, "🍝"],
  [/\b(oil|huile)\b/, "🫒"],
  [/\b(coffee|café)\b/, "☕"],
  [/\b(tea|thé)\b/, "🍵"],
  [/\b(juice|jus)\b/, "🧃"],
  [/\b(cereals?|céréales|oats|avoine|granola)\b/, "🥣"],
  [/\b(chips|croustilles|crackers?)\b/, "🍿"],
  [/\b(ice cream|crème glacée|gelato)\b/, "🍨"],
  [/\b(chocolate|chocolat|cookies?|biscuits?)\b/, "🍫"],
  [/\b(soups?|soupes?|broth|bouillon|canned|conserves?|beans|haricots)\b/, "🥫"],
  [/\b(pizza)\b/, "🍕"],
];

const BY_CATEGORY = { protein: "🍗", produce: "🥕", dairy: "🧀", bakery: "🍞", staple: "🥫" };

export function dealEmoji(deal) {
  const text = `${deal?.matchName || ""} ${deal?.item || ""}`.toLowerCase();
  for (const [re, emoji] of WORDS) if (re.test(text)) return emoji;
  return BY_CATEGORY[deal?.category] || "🛒";
}
