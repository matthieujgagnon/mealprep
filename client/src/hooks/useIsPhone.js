import { useEffect, useState } from "react";

// The design's phone layout applies below 768px (Riso Mobile.dc.html).
const QUERY = "(max-width: 767px)";

export function useIsPhone() {
  const [isPhone, setIsPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e) => setIsPhone(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isPhone;
}
