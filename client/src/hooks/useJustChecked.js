import { useEffect, useRef, useState } from "react";

// True for a moment after something goes from unchecked to checked while it is
// on screen (so a list that opens with checked items doesn't pop them all).
// Used for the grocery check animation; the CSS does nothing under "reduce
// motion".
export function useJustChecked(checked, ms = 200) {
  const before = useRef(checked);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (checked && !before.current) {
      setPop(true);
      const id = setTimeout(() => setPop(false), ms);
      before.current = checked;
      return () => clearTimeout(id);
    }
    before.current = checked;
    setPop(false);
    return undefined;
  }, [checked, ms]);
  return pop;
}
