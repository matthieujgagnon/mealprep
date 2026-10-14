import { useMediaQuery } from "./useMediaQuery.js";

// The design's phone layout applies below 768px (Riso Mobile.dc.html).
const QUERY = "(max-width: 767px)";

export function useIsPhone() {
  return useMediaQuery(QUERY);
}
