// A meal's photo address, checked: one uploaded through /api/recipe-images, a web link, or
// "none" (no picture, not even the generic one the client would pick). The Inventory item's
// `imageUrl` and the copy a planned meal keeps (PlannerEntry.photoUrl) are read the same way.
// undefined = not given; null = no photo of its own; false = not a photo.
export function photoUrl(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const url = String(value).trim();
  if (url === "none") return url;
  if (url.length > 2000) return false;
  return /^\/api\/recipe-images\/[\w-]+$/.test(url) || /^https?:\/\/\S+$/i.test(url) ? url : false;
}

// The address to draw: null for "none" and for anything missing.
export function realPhoto(value) {
  const url = photoUrl(value);
  return url && url !== "none" ? url : null;
}
