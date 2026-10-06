// @ts-check
// Occluders: shapes that hide the lines behind them (DESIGN.md §3). Each
// answers two questions:
//   contains(x, y)    is this point inside? (constant time)
//   crossing(...)     exactly where does a segment cross my drawn edge?
// Both are defined by exactly the polygon that is drawn, so a line cut at
// the crossing meets the outline with no gap (DESIGN.md §3.1).

/** @typedef {import('./polyline.js').Polyline} Polyline */

const BUCKETS = 1024;
const TAU = Math.PI * 2;

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
 * A closed outline that can be seen whole from one interior point, its
 * centre: every ray from the centre crosses the outline exactly once.
 * The forewing is one: a rounded triangle, viewed from its centroid.
 *
 * Vertices are stored in order of their angle around the centre, and a
 * table of 1024 angle buckets says where to start looking, so finding the
 * edge in any direction checks only one to three vertices.
 */
export class StarShape {
  /** @param {number} [capacity] */
  constructor(capacity = 1024) {
    this.x = new Float64Array(capacity);
    this.y = new Float64Array(capacity);
    this.a = new Float64Array(capacity);
    /** bucket[b]: last vertex whose angle is at or before the bucket start, or -1 */
    this.bucket = new Int32Array(BUCKETS);
    this.n = 0;
    this.cx = 0;
    this.cy = 0;
    this.minX = 0;
    this.minY = 0;
    this.maxX = 0;
    this.maxY = 0;
    /** False if some vertex was out of angle order and had to be dropped. */
    this.valid = true;
  }

  /**
   * Builds the shape from a closed polyline running clockwise on screen.
   * @param {Polyline} pl
   */
  set(pl) {
    const n = pl.n;
    const xy = pl.xy;
    if (n > this.x.length) {
      this.x = new Float64Array(n);
      this.y = new Float64Array(n);
      this.a = new Float64Array(n);
    }

    // Area centroid (shoelace formula): inside any roughly convex shape,
    // and not pulled towards wherever the vertices happen to be densest.
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      const cross = xy[2 * i] * xy[2 * j + 1] - xy[2 * j] * xy[2 * i + 1];
      area += cross;
      cx += (xy[2 * i] + xy[2 * j]) * cross;
      cy += (xy[2 * i + 1] + xy[2 * j + 1]) * cross;
    }
    cx /= 3 * area;
    cy /= 3 * area;
    this.cx = cx;
    this.cy = cy;

    // Start from the vertex with the smallest angle, so angles increase
    // from -π to π along the stored order.
    let start = 0;
    let minA = Infinity;
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(xy[2 * i + 1] - cy, xy[2 * i] - cx);
      if (a < minA) {
        minA = a;
        start = i;
      }
    }
    let m = 0;
    let last = -Infinity;
    this.valid = true;
    this.minX = this.minY = Infinity;
    this.maxX = this.maxY = -Infinity;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      const x = xy[2 * i];
      const y = xy[2 * i + 1];
      const a = Math.atan2(y - cy, x - cx);
      // A vertex that goes backwards in angle breaks the star rule.
      if (a <= last) {
        this.valid = false;
        continue;
      }
      last = a;
      this.x[m] = x;
      this.y[m] = y;
      this.a[m] = a;
      m++;
      if (x < this.minX) this.minX = x;
      if (x > this.maxX) this.maxX = x;
      if (y < this.minY) this.minY = y;
      if (y > this.maxY) this.maxY = y;
    }
    this.n = m;

    // Bucket b starts at angle -π + b·2π/1024.
    let v = -1;
    for (let b = 0; b < BUCKETS; b++) {
      const ab = -Math.PI + (b * TAU) / BUCKETS;
      while (v + 1 < m && this.a[v + 1] <= ab) v++;
      this.bucket[b] = v;
    }
  }

  /**
   * Index i of the edge from vertex i to vertex i+1 (wrapping) that the ray
   * at angle `a` from the centre crosses.
   * @param {number} a
   */
  edgeAt(a) {
    let b = Math.floor(((a + Math.PI) / TAU) * BUCKETS);
    if (b >= BUCKETS) b = BUCKETS - 1;
    let i = this.bucket[b];
    const n = this.n;
    while (i + 1 < n && this.a[i + 1] <= a) i++;
    // Before the first vertex or after the last: the closing edge.
    return i < 0 ? n - 1 : i;
  }

  /**
   * @param {number} px
   * @param {number} py
   */
  contains(px, py) {
    if (px < this.minX || px > this.maxX || py < this.minY || py > this.maxY) return false;
    const { x, y, cx, cy } = this;
    const i = this.edgeAt(Math.atan2(py - cy, px - cx));
    const j = i + 1 === this.n ? 0 : i + 1;
    const ex = x[j] - x[i];
    const ey = y[j] - y[i];
    // Inside if the point is on the same side of the edge as the centre.
    const sp = ex * (py - y[i]) - ey * (px - x[i]);
    const sc = ex * (cy - y[i]) - ey * (cx - x[i]);
    return sp * sc > 0;
  }

  /**
   * Where segment A→B crosses this outline near the hidden point H, as a
   * parameter in [tLo, tHi], or NaN if no edge nearby fits.
   * @param {number} ax @param {number} ay @param {number} bx @param {number} by
   * @param {number} hx @param {number} hy
   * @param {number} tLo @param {number} tHi
   */
  crossing(ax, ay, bx, by, hx, hy, tLo, tHi) {
    const n = this.n;
    const i = this.edgeAt(Math.atan2(hy - this.cy, hx - this.cx));
    // The bracket may straddle a vertex, so try the neighbouring edges too.
    for (let d = 0; d < 3; d++) {
      const k = (i + (d === 0 ? 0 : d === 1 ? n - 1 : 1)) % n;
      const j = k + 1 === n ? 0 : k + 1;
      const t = segmentHitsLine(ax, ay, bx, by, this.x[k], this.y[k], this.x[j], this.y[j], tLo, tHi);
      if (t === t) return t;
    }
    return NaN;
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
