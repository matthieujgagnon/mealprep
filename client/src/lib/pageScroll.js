// Where a page starts, in one place (App.jsx is the only caller). Opening a page, by any
// way the page can change (a header tab, the app name, Back and Forward, a link from
// another page), starts it at its top and Home on its first screen; tapping the tab you
// are already on scrolls that page back up, smoothly. A scroll a page does inside itself
// (Recipes' section buttons, Flyers' Jump to and back-to-top, a link that lands on a
// spot) is that page's own and happens after this.

export function scrollPageToTop({ smooth = false } = {}) {
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const behavior = smooth && !calm ? "smooth" : "auto";
  if (behavior === "smooth") window.scrollTo({ top: 0, left: 0, behavior });
  else window.scrollTo(0, 0);
  // Home does not scroll the page: its two screens scroll inside .home-scroller (which
  // smooths its own scrolling in CSS, and not for someone who asked for less motion).
  const home = document.querySelector(".home-scroller");
  if (home && home.scrollTop > 0) home.scrollTo({ top: 0 });
}
