import { dict } from "../i18n/index.js";
import { PHONE_PAGE_STARTS, weekendRuns } from "./plannerSlots.js";
import { takesEve } from "./weekend.js";

// The numbers of the phone Planner board (design: docs/design/riso-v2-planner-
// mobile-v2). Everything is placed in px inside one board, so the pinned meal
// names, the sliding days, the inline card and the weekend band all agree on
// where a row is, with or without a card open under it.
//
//   ┌ day tiles ─────────────┐   BOARD_TOP, TILE_H
//   │ Déjeuner (pinned name) │   LABEL_H
//   │ [card][card][card]     │   CARD_H
//   │ [inline card]          │   its measured height, only when one is open
//   │ Dîner ... Souper ...   │
//   │ Vider                  │   VIDER_H
//   └────────────────────────┘

export const COL_W = 104; // a day's column (a card is this wide)
export const GAP = 8;
export const STEP = COL_W + GAP; // from one day to the next
export const EDGE = 14; // left margin: where the pinned names and the first day start
export const CARD_H = 104;
export const TILE_H = 44;
export const LABEL_H = 18;
export const ROW_GAP = 6;
export const BOARD_TOP = 6;
export const VIDER_H = 30;
export const SWIPE_MIN = 50; // px to let go past before the page changes
export const PAGE_STARTS = PHONE_PAGE_STARTS;

// The inline card's default heights before it has been measured: an empty slot's
// card and a planned meal's card.
export const INLINE_SLOT_H = 112;
export const INLINE_PLANNED_H = 150;

export const clampPage = (p) => Math.min(PAGE_STARTS.length - 1, Math.max(0, p));

// A day column's left edge on the sliding track.
export const dayX = (day) => EDGE + day * STEP;

// How far the track is moved for a page, plus a finger that is still down.
export const trackX = (page, dragDx = 0) => -PAGE_STARTS[clampPage(page)] * STEP + dragDx;

// Where a swipe that let go after `dx` px lands: past SWIPE_MIN moves one page.
export function pageAfterSwipe(page, dx) {
  if (Math.abs(dx) < SWIPE_MIN) return page;
  return clampPage(page + (dx < 0 ? 1 : -1));
}

// The rows' tops and the board's height. `open` is the inline card under a row
// ({ meal, height }), which pushes every row below it down.
export function boardGeometry(open) {
  const push = open ? open.height + ROW_GAP : 0;
  const rowTop = (meal) => BOARD_TOP + TILE_H + ROW_GAP + LABEL_H + meal * (CARD_H + ROW_GAP + LABEL_H) + (open && meal > open.meal ? push : 0);
  const viderTop = BOARD_TOP + TILE_H + ROW_GAP + 3 * (CARD_H + ROW_GAP + LABEL_H) + push;
  return {
    rowTop,
    labelTop: (meal) => rowTop(meal) - LABEL_H,
    viderTop,
    height: viderTop + VIDER_H,
    insertTop: open ? rowTop(open.meal) + CARD_H + ROW_GAP : 0,
  };
}

// The little notch that points from the inline card at the open slot: its left
// edge inside the card, kept inside the card's rounded ends.
export function notchLeft(day, page, boardWidth = 390) {
  const centre = dayX(day) + trackX(page) + COL_W / 2;
  return Math.max(14, Math.min(boardWidth - 2 * EDGE - 32, centre - EDGE - 7));
}

// "lun–mer": a page's days, in the sticker's words (the weekday names without
// their dots).
function pageRange(page) {
  const names = dict().days.short.map((n) => n.replace(/\.$/, ""));
  const first = PAGE_STARTS[page];
  return `${names[first]}–${names[first + 2]}`;
}

// The page stickers: the first page only goes forward, the last only back, the
// middle one both. { back: "← lun–mer", forward: "ven–dim →" }, each null when
// that way is closed. The words are the real days of the next and previous page.
export function pageStickers(page) {
  const p = clampPage(page);
  return {
    back: p > 0 ? `← ${pageRange(p - 1)}` : null,
    forward: p < PAGE_STARTS.length - 1 ? `${pageRange(p + 1)} →` : null,
  };
}

// A polygon with its corners rounded by a quadratic curve: the weekend band.
export function roundedPolygon(points, radius) {
  const n = points.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = points[(i + n - 1) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];
    const l1 = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    const l2 = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    const a = [cur[0] + ((prev[0] - cur[0]) * r) / l1, cur[1] + ((prev[1] - cur[1]) * r) / l1];
    const b = [cur[0] + ((next[0] - cur[0]) * r) / l2, cur[1] + ((next[1] - cur[1]) * r) / l2];
    d += `${i ? "L" : "M"}${a[0]} ${a[1]}Q${cur[0]} ${cur[1]} ${b[0]} ${b[1]}`;
  }
  return `${d}Z`;
}

// The dotted band round each run of weekend days, as SVG paths in track
// coordinates. With "the evening before" the band also takes in the previous
// day's Souper cell, so its outline is an L (design: 1d). `geo` is the board's
// geometry, so the band follows the rows when a card pushes them down.
export function weekendBands(weekend, geo, pad = 5) {
  const days = weekend?.days || [];
  if (!weekend?.on || days.length === 0) return [];
  return weekendRuns(days).map((run) => {
    const x1 = dayX(run.start) - pad;
    const x2 = dayX(run.end) + COL_W + pad;
    const top = BOARD_TOP - pad + 1;
    const bottom = geo.rowTop(2) + CARD_H + pad;
    const supperTop = geo.rowTop(2) - pad;
    const eve = takesEve(run, days, weekend.eve);
    const points = eve
      ? [[x1, top], [x2, top], [x2, bottom], [dayX(run.start - 1) - pad, bottom], [dayX(run.start - 1) - pad, supperTop], [x1, supperTop]]
      : [[x1, top], [x2, top], [x2, bottom], [x1, bottom]];
    return { key: run.start, d: roundedPolygon(points, 18) };
  });
}
