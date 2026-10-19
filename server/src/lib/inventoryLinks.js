import { fold } from "./bilingual.js";

// « Je l'ai comme… » / "I have it as…" (routes/inventoryLinks.js): the names Matt
// taught the matcher, kept as pairs. The server only keeps them. Which recipe names
// count as which Inventory items is decided on the client (lib/inventoryMatch.js).

// How many links one account may keep, and how long a name may be.
export const LINK_MAX = 300;
export const LINK_NAME_MAX = 120;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

// A name as it is shown: no control characters, spaces collapsed, no blank edges.
export function linkLabel(value) {
  return String(value ?? "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
}

// A name as it is compared: the label with accents and capitals folded. The client's
// lib/inventoryLinks.js `linkKey` is the same function (a table in both tests holds
// them to the same answers).
export function linkKey(value) {
  return fold(linkLabel(value)).replace(/\s+/g, " ").trim();
}

// What the app sent ({ recipeName, itemName }), checked. { data } or { error } (a
// server message key, with its variables).
export function cleanLinkInput(body) {
  const input = body && typeof body === "object" ? body : {};
  const recipeLabel = linkLabel(input.recipeName);
  const itemLabel = linkLabel(input.itemName);
  const recipeName = linkKey(recipeLabel);
  const itemName = linkKey(itemLabel);
  if (!recipeName || !itemName) return { error: "linkNameEmpty" };
  if (recipeLabel.length > LINK_NAME_MAX || itemLabel.length > LINK_NAME_MAX) return { error: "linkNameTooLong", vars: { max: LINK_NAME_MAX } };
  if (recipeName === itemName) return { error: "linkSame" };
  return { data: { recipeName, itemName, recipeLabel, itemLabel } };
}
