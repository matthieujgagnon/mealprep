import { t } from "../i18n/index.js";

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

// A FoodKeeper category in the reader's language (the stored value stays
// the English name).
export function categoryLabel(category) {
  return category ? t(`foodCategories.${category}`) : "";
}

// The three built-in shelves; their labels follow the language.
export const LOCATIONS = ["fridge", "pantry", "freezer"].map((id) => ({
  id,
  get label() {
    return t(`locations.${id}`);
  },
}));

export function daysUntil(dateStr) {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function formatExpiry(expiresAt) {
  if (!expiresAt) return t("expiry.none");
  const days = daysUntil(expiresAt);
  if (days < 0) return t("expiry.expiredAgo", { days: Math.abs(days) });
  if (days === 0) return t("expiry.today");
  if (days === 1) return t("expiry.tomorrow");
  return t("expiry.inDays", { days });
}
