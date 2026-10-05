import { useCallback, useMemo, useRef, useState } from "react";

// What the shared recipe finder (components/Finder.jsx) is showing: the search,
// the filters, the Cook with picks and the Main meal. It lives in a hook so the
// screen around the finder can steer it too: the Planner focuses the search when
// an empty slot's card says "Recipe". The recipe pop-out is not kept here:
// App.jsx keeps the one pop-out for every page.
export function useFinder() {
  const [query, setQuery] = useState("");
  const [avail, setAvail] = useState("all"); // all | ready | few
  const [meal, setMeal] = useState("all");
  const [protein, setProtein] = useState("");
  const [quick, setQuick] = useState(false);
  const [expiring, setExpiring] = useState(false);
  const [picks, setPicks] = useState([]); // [{ key, name }]: Cook with
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mainId, setMainId] = useState(null);
  const [off, setOff] = useState(() => new Set()); // Main meal ingredients switched off
  const [open, setOpen] = useState(false); // the panel's results, when nothing is filtered
  const inputRef = useRef(null);
  const rootRef = useRef(null);

  const togglePick = useCallback((item) => {
    setPicks((prev) => (prev.some((p) => p.key === item.key) ? prev.filter((p) => p.key !== item.key) : [...prev, { key: item.key, name: item.name }]));
  }, []);

  // Similar recipes: this recipe becomes the Main meal, with all its
  // ingredients switched on, and the results show.
  const setMainMeal = useCallback((id) => {
    setMainId(id);
    setOff(new Set());
    if (id) setOpen(true);
  }, []);

  const toggleIngredient = useCallback((key) => {
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const filtered = !!(query.trim() || avail !== "all" || meal !== "all" || protein || quick || expiring || picks.length);

  const clearFilters = useCallback(() => {
    setQuery("");
    setAvail("all");
    setMeal("all");
    setProtein("");
    setQuick(false);
    setExpiring(false);
    setPicks([]);
  }, []);

  // Scrolls the finder into view and puts the cursor in its search box.
  const focusSearch = useCallback(() => {
    setOpen(true);
    rootRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
  }, []);

  return useMemo(
    () => ({
      query, setQuery, avail, setAvail, meal, setMeal, protein, setProtein, quick, setQuick, expiring, setExpiring,
      picks, togglePick, setPicks, pickerOpen, setPickerOpen, mainId, setMainMeal, off, toggleIngredient,
      open, setOpen, filtered, clearFilters, focusSearch, inputRef, rootRef,
    }),
    [query, avail, meal, protein, quick, expiring, picks, pickerOpen, mainId, off, open, filtered, togglePick, setMainMeal, toggleIngredient, clearFilters, focusSearch]
  );
}
