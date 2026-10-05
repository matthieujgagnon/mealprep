// Which of last week's placements "Copy last week" puts on the new week: only
// the ones whose slot (day and meal) is empty there, so nothing is ever
// replaced or doubled. A slot holds one thing, so when the old week somehow
// held two in a slot, the first (by position) is the one copied.
export function entriesToCopy(source, existingTarget) {
  const taken = new Set(existingTarget.map((e) => `${e.dayOfWeek}-${e.mealType}`));
  const ordered = [...source].sort((a, b) => a.position - b.position);
  const copy = [];
  for (const entry of ordered) {
    const key = `${entry.dayOfWeek}-${entry.mealType}`;
    if (taken.has(key)) continue;
    taken.add(key);
    copy.push(entry);
  }
  return copy;
}
