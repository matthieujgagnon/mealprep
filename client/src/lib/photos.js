// A recipe photo that fails to load (moved, deleted, blocked by the site)
// just disappears, leaving the card's plain photo background instead of a
// broken-image icon.
export function hideBrokenPhoto(e) {
  e.currentTarget.style.visibility = "hidden";
}
