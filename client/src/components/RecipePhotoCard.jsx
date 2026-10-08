import { RecipePhoto } from "./RecipePhoto.jsx";

// The one photo card behind both recipe cards (design: docs/design/
// riso-v2-recipe-cards/): a full-bleed photo, a dark scrim at the top for the
// caption, a darker scrim at the bottom with the title centred on it, a 2px ink
// outline and the soft card shadow (--riso-shadow-photo-card). Tapping the
// photo or the title opens the recipe (`onOpen`): they are one button.
//
//   variant="grid"   the Recipes card: the whole card is the photo, 3:4, a thin
//                    meal-colour line (`lineColor`) along the bottom.
//   variant="panel"  the Makeable card: a photo of fixed height and, under it,
//                    whatever the caller passes as children (the white panel).
//                    `ready` turns the outline green.
//
// `caption` is the text over the top of the photo; each variant lays it out.
// A new recipe card is this with another caption and children, not a new card.
export function RecipePhotoCard({ variant = "grid", title, photoUrl, caption, lineColor, ready, openLabel, onOpen, className, children }) {
  return (
    <article className={`rpc rpc-${variant}${ready ? " is-ready" : ""}${className ? ` ${className}` : ""}`}>
      {/* The photo, the caption and the title are one button (spans only, so it stays valid inside a button). */}
      <button type="button" className="rpc-open" aria-label={openLabel} onClick={(e) => onOpen?.(e.currentTarget.closest(".rpc").getBoundingClientRect())}>
        {photoUrl ? <RecipePhoto className="rpc-img" src={photoUrl} alt="" draggable="false" /> : null}
        <span className="rpc-scrim-top" aria-hidden="true" />
        <span className="rpc-caption">{caption}</span>
        <span className="rpc-scrim-bottom">
          <span className="rpc-title">{title}</span>
        </span>
        {lineColor ? <span className="rpc-line" style={{ background: lineColor }} aria-hidden="true" /> : null}
      </button>
      {children}
    </article>
  );
}
