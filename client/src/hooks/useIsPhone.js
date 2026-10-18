import { useMediaQuery } from "./useMediaQuery.js";

// The design's phone layout applies below 768px (Riso Mobile.dc.html).
export const PHONE_QUERY = "(max-width: 767px)";

export function useIsPhone() {
  return useMediaQuery(PHONE_QUERY);
}
