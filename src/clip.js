// @ts-check
// Hidden-line removal. A polyline is walked in steps of at most MAX_STEP
// units; each step asks the occluders whether the point is covered. Where
// the answer flips, the crossing is found exactly (DESIGN.md §3.1) and the
// visible runs are written to the builder.

/** @typedef {import('./builder.js').Builder} Builder */
/** @typedef {import('./shapes.js').StarShape | import('./shapes.js').ProfileShape} Occluder */

/** Longest stretch walked without testing; smaller than any occluder. */
const MAX_STEP = 2;
/** Halvings of the bracketing step: 2 units / 4096 < 0.0005 units. */
const BISECT = 12;

/**
 * Index of the first occluder covering the point, or -1 if it is visible.
 * @param {readonly Occluder[]} occ
 * @param {number} x
 * @param {number} y
 */
function cover(occ, x, y) {
  for (let k = 0; k < occ.length; k++) if (occ[k].contains(x, y)) return k;
  return -1;
}

/**
 * Parameter on segment A→B where visibility changes, given that it changes
 * somewhere between tVis (visible) and tHid (hidden).
 * @param {readonly Occluder[]} occ
 * @param {number} ax @param {number} ay @param {number} bx @param {number} by
 * @param {number} tVis @param {number} tHid
 */
function crossingAt(occ, ax, ay, bx, by, tVis, tHid) {
  // 1. Bracket: halve the interval, keeping the visible and hidden ends.
  let k = -1;
  for (let it = 0; it < BISECT; it++) {
    const tm = (tVis + tHid) / 2;
    const c = cover(occ, ax + (bx - ax) * tm, ay + (by - ay) * tm);
    if (c < 0) tVis = tm;
    else {
      tHid = tm;
      k = c;
    }
  }
  const hx = ax + (bx - ax) * tHid;
  const hy = ay + (by - ay) * tHid;
  if (k < 0) k = cover(occ, hx, hy);
  // 2. Snap: intersect with the actual edge of the occluder that hides us.
  const lo = tVis < tHid ? tVis : tHid;
  const hi = tVis < tHid ? tHid : tVis;
  const t = k < 0 ? NaN : occ[k].crossing(ax, ay, bx, by, hx, hy, lo, hi);
  return t === t ? t : (tVis + tHid) / 2;
}

/**
 * Writes the parts of a polyline that no occluder covers.
 * @param {Builder} b
 * @param {number} layer
 * @param {boolean} mirror
 * @param {Float64Array} xy  x and y interleaved
 * @param {number} n         vertex count
 * @param {boolean} closed   also draw the segment from the last vertex to the first
 * @param {readonly Occluder[]} occ  front-most first
 */
export function drawVisible(b, layer, mirror, xy, n, closed, occ) {
  if (n < 2) return;
  let hidden = cover(occ, xy[0], xy[1]) >= 0;
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
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / MAX_STEP));
    let tPrev = 0;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const qx = ax + (bx - ax) * t;
      const qy = ay + (by - ay) * t;
      const qHidden = cover(occ, qx, qy) >= 0;
      if (qHidden !== hidden) {
        const tc = hidden ? crossingAt(occ, ax, ay, bx, by, t, tPrev) : crossingAt(occ, ax, ay, bx, by, tPrev, t);
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
