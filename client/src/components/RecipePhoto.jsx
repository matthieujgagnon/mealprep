import { useState } from "react";

// A recipe's photo. When the picture does not load (moved, deleted, blocked by
// the site) it just disappears, leaving the plain background behind it instead
// of a broken-image icon. What failed is remembered per photo address, so the
// same <img> given another address (a card reused for another recipe, another
// week) tries again instead of staying hidden.
export function RecipePhoto({ src, style, onError, ...rest }) {
  const [failedSrc, setFailedSrc] = useState(null);
  return (
    <img
      {...rest}
      src={src}
      style={failedSrc === src ? { ...style, visibility: "hidden" } : style}
      onError={(e) => {
        setFailedSrc(src);
        onError?.(e);
      }}
    />
  );
}
