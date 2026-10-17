// Where each section goes while one is carried to a new place among sections of
// different widths on a 12-column grid (Inventory's shelves: Full, Half, Third).
// The grid fills a row from the left, and a section that does not fit in what is
// left of the row starts the next one; a row is as tall as its tallest section.
// This works the new layout out the same way, so what the other sections slide
// to while you carry one is where they will be when you drop it, and none of them
// is stretched. With one section per row (a phone) it is a plain list.

// rects: the sections' boxes in their current order, as dnd-kit measures them
// (without any transform). Gives back, for every section, how far it has to
// move: { x, y }.
export function gridShifts({ rects, activeIndex, overIndex, columns, gap, containerWidth }) {
  const none = rects.map(() => ({ x: 0, y: 0 }));
  const inside = (i) => Number.isInteger(i) && i >= 0 && i < rects.length;
  if (!inside(activeIndex) || !inside(overIndex) || activeIndex === overIndex) return none;

  const colWidth = (containerWidth - gap * (columns - 1)) / columns;
  // A width in whole columns (a section is never under one, nor over the row).
  const spanOf = (rect) => Math.min(columns, Math.max(1, Math.round((rect.width + gap) / (colWidth + gap))));

  const order = rects.map((_, i) => i);
  order.splice(overIndex, 0, ...order.splice(activeIndex, 1));

  const placed = [];
  let col = 0;
  let row = 0;
  for (const i of order) {
    const span = spanOf(rects[i]);
    if (col + span > columns) {
      row += 1;
      col = 0;
    }
    placed.push({ i, col, row });
    col += span;
  }

  const rowHeight = [];
  for (const { i, row: r } of placed) rowHeight[r] = Math.max(rowHeight[r] ?? 0, rects[i].height);
  const rowTop = [];
  let y = 0;
  for (let r = 0; r < rowHeight.length; r++) {
    rowTop[r] = y;
    y += rowHeight[r] + gap;
  }

  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const shifts = [...none];
  for (const { i, col: c, row: r } of placed) {
    shifts[i] = {
      x: left + c * (colWidth + gap) - rects[i].left,
      y: top + rowTop[r] - rects[i].top,
    };
  }
  return shifts;
}

// dnd-kit's sorting strategy for that: pass it to <ReorderList strategy={...}>.
// `getGrid` gives the grid's element (read when a drag starts moving, not on every
// frame); its width and gap come from the page's own CSS.
export function gridSortingStrategy({ columns, getGrid }) {
  let last = null;
  return ({ rects, activeIndex, overIndex, index }) => {
    if (!last || last.rects !== rects || last.activeIndex !== activeIndex || last.overIndex !== overIndex) {
      const grid = getGrid();
      const width = grid?.getBoundingClientRect().width;
      const gap = parseFloat(grid ? getComputedStyle(grid).columnGap : "") || 0;
      last = {
        rects,
        activeIndex,
        overIndex,
        shifts: width ? gridShifts({ rects, activeIndex, overIndex, columns, gap, containerWidth: width }) : null,
      };
    }
    const shift = last.shifts?.[index];
    return shift ? { x: shift.x, y: shift.y, scaleX: 1, scaleY: 1 } : null;
  };
}
