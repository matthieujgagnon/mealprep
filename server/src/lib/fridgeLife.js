// One-time smart default for "days good in the fridge as leftovers" — looks
// at a recipe's ingredient names and suggests a shelf life based on the most
// perishable category present, erring conservative (standard food-safety
// guidance, not a guarantee). This is only ever a starting point: it fills
// the field in once at creation time so most recipes don't need a number
// typed in by hand, but it's always editable afterward.
//
// Mirrored in client/src/lib/fridgeLife.js for the manual-entry form, the
// same way UNIT_ALIASES is mirrored between groceryList.js and this file —
// client and server are separate workspaces with no shared import path.
export function estimateFridgeLifeDays(ingredientNames) {
  const text = ingredientNames.join(" ").toLowerCase();

  // Seafood spoils fastest — 1-2 days is standard food-safety guidance.
  if (/\b(salmon|tuna|shrimp|prawns?|fish|seafood|tilapia|cod|halibut|scallops?|crab|lobster|mussels?|oysters?|clams?)\b/.test(text)) {
    return 2;
  }
  // Ground meat and poultry: USDA guidance is 3-4 days.
  if (/\b(chicken|turkey|ground beef|ground pork|ground turkey|ground chicken|sausage|bacon)\b/.test(text)) {
    return 3;
  }
  // Whole-cut beef/pork/lamb roasts and steaks keep a little longer.
  if (/\b(beef|steak|pork|lamb|roast|brisket)\b/.test(text)) {
    return 4;
  }
  // Cream/dairy-based sauces and cheese dishes.
  if (/\b(cream|milk|cheese|yogurt|alfredo|dairy)\b/.test(text)) {
    return 4;
  }
  // Grain/legume-based dishes (soups, stews, chilis, rice, pasta, beans)
  // tend to hold up the longest of common home-cooked meals.
  if (/\b(soup|stew|chili|lentils?|beans?|rice|pasta|quinoa|grain)\b/.test(text)) {
    return 5;
  }
  // General USDA leftovers guidance for anything else.
  return 3;
}
