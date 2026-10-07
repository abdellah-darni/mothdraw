// @ts-check
// Hidden-line removal. A polyline is walked in steps of at most MAX_STEP
// units; each step asks whether the point is visible: inside the shape the
// line belongs to (if any) and not covered by an occluder in front. Where
// the answer flips, the crossing is found exactly (DESIGN.md §3.1) and the
// visible runs are written to the builder.

import { vlen } from './geom.js';

/** @typedef {import('./builder.js').Builder} Builder */
/** @typedef {import('./shapes.js').BandShape | import('./shapes.js').ProfileShape} Occluder */

/** Longest stretch walked without testing; smaller than any occluder. */
const MAX_STEP = 2;
/** Halvings of the bracketing step: 2 units / 4096 < 0.0005 units. */
const BISECT = 12;

/**
 * The shape that hides this point, or null if it is visible: `inside` if
 * the point is outside it, otherwise the first occluder covering it.
 * @param {Occluder | null} inside
 * @param {readonly Occluder[]} occ
 * @param {number} x
 * @param {number} y
 * @returns {Occluder | null}
 */
function blocker(inside, occ, x, y) {
  if (inside !== null && !inside.contains(x, y)) return inside;
  for (let k = 0; k < occ.length; k++) if (occ[k].contains(x, y)) return occ[k];
  return null;
}

/**
 * Parameter on segment A→B where visibility changes, given that it changes
 * somewhere between tVis (visible) and tHid (hidden).
 * @param {Occluder | null} inside
 * @param {readonly Occluder[]} occ
 * @param {number} ax @param {number} ay @param {number} bx @param {number} by
 * @param {number} tVis @param {number} tHid
 */
function crossingAt(inside, occ, ax, ay, bx, by, tVis, tHid) {
  // 1. Bracket: halve the interval, keeping the visible and hidden ends,
  //    and remember which shape hides the hidden end.
  /** @type {Occluder | null} */
  let k = null;
  for (let it = 0; it < BISECT; it++) {
    const tm = (tVis + tHid) / 2;
    const c = blocker(inside, occ, ax + (bx - ax) * tm, ay + (by - ay) * tm);
    if (c === null) tVis = tm;
    else {
      tHid = tm;
      k = c;
    }
  }
  const hx = ax + (bx - ax) * tHid;
  const hy = ay + (by - ay) * tHid;
  if (k === null) k = blocker(inside, occ, hx, hy);
  // 2. Snap: intersect with the actual edge of that shape.
  const lo = tVis < tHid ? tVis : tHid;
  const hi = tVis < tHid ? tHid : tVis;
  const t = k === null ? NaN : k.crossing(ax, ay, bx, by, hx, hy, lo, hi);
  return t === t ? t : (tVis + tHid) / 2;
}

/**
 * Writes the visible parts of a polyline.
 * @param {Builder} b
 * @param {number} layer
 * @param {boolean} mirror
 * @param {Float64Array} xy  x and y interleaved
 * @param {number} n         vertex count
 * @param {boolean} closed   also draw the segment from the last vertex to the first
 * @param {Occluder | null} inside  keep only what is inside this shape (null: no limit)
 * @param {readonly Occluder[]} occ  shapes in front, front-most first
 */
export function drawVisible(b, layer, mirror, xy, n, closed, inside, occ) {
  if (n < 2) return;
  let hidden = blocker(inside, occ, xy[0], xy[1]) !== null;
  if (!hidden) {
    b.begin(layer, mirror);
    b.point(xy[0], xy[1]);
  }
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    const ax = xy[2 * i];
    const ay = xy[2 * i + 1];
    const bx = xy[2 * j];
    const by = xy[2 * j + 1];
    const steps = Math.max(1, Math.ceil(vlen(bx - ax, by - ay) / MAX_STEP));
    let tPrev = 0;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const qx = ax + (bx - ax) * t;
      const qy = ay + (by - ay) * t;
      const qHidden = blocker(inside, occ, qx, qy) !== null;
      if (qHidden !== hidden) {
        const tc = hidden
          ? crossingAt(inside, occ, ax, ay, bx, by, t, tPrev)
          : crossingAt(inside, occ, ax, ay, bx, by, tPrev, t);
        const cx = ax + (bx - ax) * tc;
        const cy = ay + (by - ay) * tc;
        if (hidden) {
          b.begin(layer, mirror);
          b.point(cx, cy);
        } else {
          b.point(cx, cy);
          b.end();
        }
        hidden = qHidden;
      }
      // Intermediate steps lie on the straight segment; only the real
      // vertex needs writing.
      if (!hidden && s === steps) b.point(qx, qy);
      tPrev = t;
    }
  }
  b.end();
}

const seg = new Float64Array(6);

/**
 * A short stroke of two or three points (the bulk of all texture).
 * @param {Builder} b @param {number} layer @param {boolean} mirror
 * @param {number} x0 @param {number} y0
 * @param {number} x1 @param {number} y1
 * @param {number} x2 @param {number} y2  pass NaN for a two-point stroke
 * @param {Occluder | null} inside
 * @param {readonly Occluder[]} occ
 */
export function drawStroke(b, layer, mirror, x0, y0, x1, y1, x2, y2, inside, occ) {
  seg[0] = x0;
  seg[1] = y0;
  seg[2] = x1;
  seg[3] = y1;
  seg[4] = x2;
  seg[5] = y2;
  drawVisible(b, layer, mirror, seg, x2 === x2 ? 3 : 2, false, inside, occ);
}
