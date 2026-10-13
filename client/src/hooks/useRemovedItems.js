import { useEffect, useState } from "react";
import { api } from "../api.js";
import { onRemovedChanged } from "../lib/removedItems.js";

// Inventory's Recently removed list ([{ id, itemId, how, removedAt, item }],
// newest first), read when the page opens and again whenever a removal, an Undo
// or a Put back has landed (lib/removedItems.js). Only the newest answer is kept.
export function useRemovedItems() {
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    let asked = 0;
    const load = () => {
      const n = ++asked;
      api
        .listRemovedPantryItems()
        .then((rows) => alive && n === asked && setList(rows || []))
        .catch(() => {});
    };
    load();
    const off = onRemovedChanged(load);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return [list, setList];
}
