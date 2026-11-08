import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";

// What the account's examples are right now (server lib/examples.js): { counts, canAdd, preview },
// or null until it has been read (or when it can't be). `counts` is exactly what « Retirer les
// exemples » would take, so the banner, the account menu and the confirm sheet all say the same.
// Call `refresh` after anything that changes them (adding, removing, undoing).
export function useExamples() {
  const [info, setInfo] = useState(null);
  const refresh = useCallback(() => api.getExamples().then(setInfo).catch(() => {}), []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { info, refresh };
}
