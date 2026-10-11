// The Cookbook's bento grid (design: docs/design/riso-v2-recipes-bento/). Pure
// functions so the layout can be tested without a browser.
//
// On a wide page the tiles come in a repeating pattern of 8 on a 4-column grid
// (4 rows, no gaps). Each tile is [columns, rows, title size in px]:
//   1  2x2  34     5  1x2  26
//   2  1x1  18     6  2x1  26
//   3  1x1  18     7  1x1  18
//   4  2x1  26     8  3x1  30
// The pattern starts again at the top of the section, and after every filter or
// search, so the first result is always the big tile. Title size follows tile
// size: 1x1 18, 2x1 or 1x2 26, 3x1 or 4x1 30, anything bigger 34.
export const BENTO_COLUMNS = 4;

const PATTERN = [
  [2, 2],
  [1, 1],
  [1, 1],
  [2, 1],
  [1, 2],
  [2, 1],
  [1, 1],
  [3, 1],
];

// The design only draws full groups of 8. The first 4 tiles also close cleanly (they
// fill two rows). Any other count leaves the grid with a notch at the end, so the last
// group's final tiles stretch to fill it: Matt's rule, "no gaps".
//   1 tile   one full-width 4x2
//   2        two 2x2
//   3        a 2x2 and two stacked 2x1
//   5        the first four, then a full-width 4x1
//   6        the first four, then a 1x2 and a 3x2
//   7        the first four, then a 1x2, a 2x2 and a 1x2
const FIRST_FOUR = PATTERN.slice(0, 4);
const CLOSING = {
  1: [[4, 2]],
  2: [
    [2, 2],
    [2, 2],
  ],
  3: [
    [2, 2],
    [2, 1],
    [2, 1],
  ],
  5: [...FIRST_FOUR, [4, 1]],
  6: [...FIRST_FOUR, [1, 2], [3, 2]],
  7: [...FIRST_FOUR, [1, 2], [2, 2], [1, 2]],
};

export function bentoTitleSize(cols, rows) {
  if (cols * rows === 1) return 18;
  if (cols * rows === 2) return 26;
  if (rows === 1 && cols >= 3) return 30;
  return 34;
}

// The size of every tile of a section with `count` recipes, in order:
// [{ cols, rows, title }].
export function bentoLayout(count) {
  const sizes = [];
  const full = Math.floor(count / PATTERN.length);
  for (let g = 0; g < full; g++) sizes.push(...PATTERN);
  const rest = count % PATTERN.length;
  if (rest > 0) sizes.push(...(CLOSING[rest] || PATTERN.slice(0, rest)));
  return sizes.map(([cols, rows]) => ({ cols, rows, title: bentoTitleSize(cols, rows) }));
}

// Where the browser puts those tiles (CSS grid's automatic placement with
// `grid-column: span c; grid-row: span r`), as { row, col, cols, rows } from 1,
// plus how many rows the grid ends up with and how many cells stay empty. Used
// by the tests to prove that no layout has a gap.
export function bentoPlacement(layout, columns = BENTO_COLUMNS) {
  const taken = new Set();
  const tiles = [];
  let row = 1;
  let col = 1;
  for (const { cols, rows } of layout) {
    for (;;) {
      if (col + cols - 1 > columns) {
        col = 1;
        row++;
        continue;
      }
      let free = true;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (taken.has(`${row + y},${col + x}`)) free = false;
      if (free) break;
      col++;
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) taken.add(`${row + y},${col + x}`);
    tiles.push({ row, col, cols, rows });
    col += cols;
  }
  const totalRows = tiles.reduce((m, t) => Math.max(m, t.row + t.rows - 1), 0);
  let empty = 0;
  for (let y = 1; y <= totalRows; y++) for (let x = 1; x <= columns; x++) if (!taken.has(`${y},${x}`)) empty++;
  return { tiles, rows: totalRows, empty };
}
