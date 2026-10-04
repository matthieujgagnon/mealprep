import { useState } from "react";
import { foodEmoji } from "../lib/dealEmoji.js";
import { genericPhotoUrl } from "../lib/ingredientPhoto.js";

// What a card shows: the item's own photo, else TheMealDB's generic picture
// of the ingredient, else nothing (imageUrl "none" turns the generic off).
export function photoFor(item) {
  if (item.imageUrl === "none") return null;
  if (item.imageUrl) return { src: item.imageUrl, own: true };
  const generic = genericPhotoUrl(item.name);
  return generic ? { src: generic, own: false } : null;
}

// The photo, else a cream tile with a food emoji (or its first letter) -
// and the same tile if the photo won't load.
export function ItemPhoto({ item }) {
  const photo = photoFor(item);
  const [failed, setFailed] = useState(null);
  if (photo && failed !== photo.src) {
    return (
      <img
        className={`inv-card-photo${photo.own ? "" : " generic"}`}
        src={photo.src}
        alt=""
        loading="lazy"
        onError={() => setFailed(photo.src)}
      />
    );
  }
  const emoji = foodEmoji(item.name, item.category);
  return (
    <span className={`inv-card-photo placeholder${emoji ? "" : " letter"}`} aria-hidden="true">
      {emoji || (item.name.trim()[0] || "?").toUpperCase()}
    </span>
  );
}
