// @ts-check
// Occluders: shapes that hide the lines behind them (DESIGN.md §3). Each
// answers two questions:
//   contains(x, y)    is this point inside? (constant time)
//   crossing(...)     exactly where does a segment cross my drawn edge?
// Both are defined by exactly the polygon that is drawn, so a line cut at
// the crossing meets the outline with no gap (DESIGN.md §3.1).

/** @typedef {import('./polyline.js').Polyline} Polyline */

/** Horizontal bands in a BandShape's lookup table. */
const BANDS = 256;

/**
 * Parameter t in [tLo, tHi] (with a little slack) where segment A→B meets
 * the line through V0→V1, or NaN.
 * @param {number} ax @param {number} ay @param {number} bx @param {number} by
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {number} tLo @param {number} tHi
 */
function segmentHitsLine(ax, ay, bx, by, x0, y0, x1, y1, tLo, tHi) {
  const ex = x1 - x0;
  const ey = y1 - y0;
  const den = (bx - ax) * ey - (by - ay) * ex;
  if (den === 0) return NaN;
  const t = ((x0 - ax) * ey - (y0 - ay) * ex) / den;
  const slack = (tHi - tLo) + 1e-9;
  return t >= tLo - slack && t <= tHi + slack ? t : NaN;
}

/**
 * Any simple closed polygon, tested by the even-odd rule: a point is
 * inside if a ray to its right crosses the outline an odd number of times.
 * To avoid checking every edge, the shape's height is cut into horizontal
 * bands and each band lists the edges that cross it, so a test looks at
 * only the 2 to 4 edges in the point's band. Works for wings with tails,
 * hooks or any other outline.
 */
export class BandShape {
  /** @param {number} [capacity] */
  constructor(capacity = 1024) {
    this.x = new Float64Array(capacity);
    this.y = new Float64Array(capacity);
    this.n = 0;
    /** start[b] .. start[b+1] index into `edges` for band b */
    this.start = new Int32Array(BANDS + 1);
    this.edges = new Int32Array(capacity * 2);
    this.minX = 0;
    this.minY = 0;
    this.maxX = 0;
    this.maxY = 0;
    this.bandH = 1;
  }

  /**
   * @param {Polyline} pl closed polyline
   */
  set(pl) {
    const n = pl.n;
    const xy = pl.xy;
    if (n > this.x.length) {
      this.x = new Float64Array(n);
      this.y = new Float64Array(n);
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = xy[2 * i];
      const y = xy[2 * i + 1];
      this.x[i] = x;
      this.y[i] = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    this.n = n;
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;
    const bandH = (this.bandH = (maxY - minY) / BANDS || 1);

    // Two passes over the edges: count per band, then fill (CSR layout).
    const start = this.start;
    start.fill(0);
    let total = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const j = i + 1 === n ? 0 : i + 1;
        const ya = this.y[i] < this.y[j] ? this.y[i] : this.y[j];
        const yb = this.y[i] < this.y[j] ? this.y[j] : this.y[i];
        const b0 = Math.min(BANDS - 1, Math.floor((ya - minY) / bandH));
        const b1 = Math.min(BANDS - 1, Math.floor((yb - minY) / bandH));
        for (let b = b0; b <= b1; b++) {
          if (pass === 0) start[b + 1]++;
          else this.edges[start[b]++] = i;
        }
      }
      if (pass === 0) {
        for (let b = 0; b < BANDS; b++) start[b + 1] += start[b];
        total = start[BANDS];
        if (total > this.edges.length) this.edges = new Int32Array(total * 2);
      } else {
        // Filling advanced each start to the next band's; shift back.
        for (let b = BANDS; b > 0; b--) start[b] = start[b - 1];
        start[0] = 0;
      }
    }
  }

  /**
   * @param {number} px
   * @param {number} py
   */
  contains(px, py) {
    if (px < this.minX || px > this.maxX || py < this.minY || py >= this.maxY) return false;
    const { x, y, n, edges } = this;
    const b = Math.floor((py - this.minY) / this.bandH);
    let inside = false;
    for (let k = this.start[b], end = this.start[b + 1]; k < end; k++) {
      const i = edges[k];
      const j = i + 1 === n ? 0 : i + 1;
      const y0 = y[i];
      const y1 = y[j];
      if (y0 > py !== y1 > py && x[i] + ((py - y0) * (x[j] - x[i])) / (y1 - y0) > px) inside = !inside;
    }
    return inside;
  }

  /**
   * Same contract as ProfileShape.crossing. Checks the edges in the bands
   * that the bracketing interval touches.
   * @param {number} ax @param {number} ay @param {number} bx @param {number} by
   * @param {number} hx @param {number} hy
   * @param {number} tLo @param {number} tHi
   */
  crossing(ax, ay, bx, by, hx, hy, tLo, tHi) {
    const { x, y, n, edges, minY, bandH } = this;
    const yLo = ay + (by - ay) * tLo;
    const yHi = ay + (by - ay) * tHi;
    let b0 = Math.floor(((yLo < yHi ? yLo : yHi) - minY) / bandH);
    let b1 = Math.floor(((yLo < yHi ? yHi : yLo) - minY) / bandH);
    if (b0 < 0) b0 = 0;
    if (b1 > BANDS - 1) b1 = BANDS - 1;
    const dx = bx - ax;
    const dy = by - ay;
    const slack = tHi - tLo + 1e-9;
    let best = NaN;
    for (let b = b0; b <= b1; b++) {
      for (let k = this.start[b], end = this.start[b + 1]; k < end; k++) {
        const i = edges[k];
        const j = i + 1 === n ? 0 : i + 1;
        const ex = x[j] - x[i];
        const ey = y[j] - y[i];
        const den = dx * ey - dy * ex;
        if (den === 0) continue;
        const t = ((x[i] - ax) * ey - (y[i] - ay) * ex) / den;
        const s = ((x[i] - ax) * dy - (y[i] - ay) * dx) / den;
        if (s >= -1e-9 && s <= 1 + 1e-9 && t >= tLo - slack && t <= tHi + slack) {
          if (!(best === best) || Math.abs(t - (tLo + tHi) / 2) < Math.abs(best - (tLo + tHi) / 2)) best = t;
        }
      }
    }
    return best;
  }
}

/**
 * A shape symmetric about x = 0, given as a half-width for each row of a
 * fixed vertical spacing: head, thorax, abdomen. Between rows the edge is
 * the straight segment joining them, which is exactly what is drawn.
 */
export class ProfileShape {
  /** @param {number} [capacity] */
  constructor(capacity = 512) {
    /** Half-width of each row; set the rows, then call finish(). */
    this.w = new Float64Array(capacity);
    this.n = 0;
    this.y0 = 0;
    this.dy = 1;
    this.maxW = 0;
  }

  /**
   * Prepares rows from y0 to y0 + length, about `spacing` apart. Returns
   * the row count; fill this.w[0 .. count-1], with zero at both ends, then
   * call finish().
   * @param {number} y0 @param {number} length @param {number} spacing
   */
  reset(y0, length, spacing) {
    const n = Math.max(3, Math.ceil(length / spacing) + 1);
    if (n > this.w.length) this.w = new Float64Array(n);
    this.n = n;
    this.y0 = y0;
    this.dy = length / (n - 1);
    return n;
  }

  finish() {
    let m = 0;
    for (let i = 0; i < this.n; i++) if (this.w[i] > m) m = this.w[i];
    this.maxW = m;
  }

  /**
   * @param {number} px
   * @param {number} py
   */
  contains(px, py) {
    const ax = px < 0 ? -px : px;
    if (ax >= this.maxW) return false;
    const k = (py - this.y0) / this.dy;
    if (!(k >= 0 && k < this.n - 1)) return false;
    const i = k | 0;
    const w = this.w[i] + (this.w[i + 1] - this.w[i]) * (k - i);
    return ax < w;
  }

  /**
   * Same contract as StarShape.crossing.
   * @param {number} ax @param {number} ay @param {number} bx @param {number} by
   * @param {number} hx @param {number} hy
   * @param {number} tLo @param {number} tHi
   */
  crossing(ax, ay, bx, by, hx, hy, tLo, tHi) {
    const { w, n, y0, dy } = this;
    const side = hx < 0 ? -1 : 1;
    let i = Math.floor((hy - y0) / dy);
    if (i < 0) i = 0;
    if (i > n - 2) i = n - 2;
    for (let d = 0; d < 3; d++) {
      const k = i + (d === 0 ? 0 : d === 1 ? -1 : 1);
      if (k < 0 || k > n - 2) continue;
      const t = segmentHitsLine(ax, ay, bx, by, side * w[k], y0 + k * dy, side * w[k + 1], y0 + (k + 1) * dy, tLo, tHi);
      if (t === t) return t;
    }
    return NaN;
  }

  /**
   * Writes the closed outline: down the right side, back up the left.
   * @param {Polyline} out
   */
  outline(out) {
    const { w, n, y0, dy } = this;
    out.reset();
    for (let i = 0; i < n; i++) out.push(w[i], y0 + i * dy);
    // Skip the end rows on the way back: their width is zero, so they
    // coincide with points already written.
    for (let i = n - 2; i > 0; i--) out.push(-w[i], y0 + i * dy);
  }
}
