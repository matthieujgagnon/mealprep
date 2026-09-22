// Shared between Inventory.jsx (full CRUD UI) and WhatCanIMake.jsx (the
// read-mostly checklist + filters on Makeable) - previously duplicated
// verbatim in both files.

// Mirrors server/src/lib/foodkeeper.js's CATEGORIES exactly (the 13 labels
// that actually occur in the bundled USDA FoodKeeper data, plus "Other") -
// the order here is also the section order Inventory.jsx's list groups into.
export const CATEGORIES = [
  "Produce",
  "Meat",
  "Poultry",
  "Seafood",
  "Dairy Products & Eggs",
  "Grains, Beans & Pasta",
  "Baked Goods",
  "Condiments, Sauces & Canned Goods",
  "Beverages",
  "Deli & Prepared Foods",
  "Food Purchased Frozen",
  "Shelf Stable Foods",
  "Vegetarian Proteins",
  "Other",
];

export const LOCATIONS = [
  { id: "fridge", label: "Fridge" },
  { id: "pantry", label: "Pantry" },
  { id: "freezer", label: "Freezer" },
];

export function daysUntil(dateStr) {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function formatExpiry(expiresAt) {
  if (!expiresAt) return "No date set";
  const days = daysUntil(expiresAt);
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days}d`;
}
