import { useEffect, useState } from "react";
import { api } from "../api.js";
import { toDateKey } from "../lib/dates.js";
import { buildGroceryList } from "../lib/groceryList.js";
import { applyChecks } from "../lib/groceryChecks.js";

// How many items the Grocery list still has to buy: the same list Grocery and
// Home build (every planned meal from today on, your own items, minus pantry
// staples, removed items and what "Done shopping" already bought). The phone
// Planner's "Make the grocery list" button shows it. It reads again when
// `refreshKey` changes (the plan changed).
export function useGroceryToBuyCount({ customStaples, excludedStaples, refreshKey }) {
  const [data, setData] = useState({ upcoming: [], checkRows: {}, extras: [], overrides: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.listPlannerUpcoming(toDateKey(new Date())).catch(() => []),
      api
        .listGroceryChecked()
        .then((rows) => Object.fromEntries(rows.map((row) => [row.core, row])))
        .catch(() => ({})),
      api.listGroceryExtras().catch(() => []),
      api.listGroceryOverrides().catch(() => []),
    ]).then(([upcoming, checkRows, extras, overrides]) => {
      if (!cancelled) setData({ upcoming, checkRows, extras, overrides });
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const items = buildGroceryList(data.upcoming, customStaples, {}, excludedStaples, data.extras, data.overrides);
  const { items: toBuy } = applyChecks(
    items.filter((i) => !i.isStaple && !i.removed),
    data.checkRows
  );
  return toBuy.length;
}
