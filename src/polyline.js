// @ts-check
// Scratch geometry: a growable point list, closed outlines built from
// curved edges with rounded corners, and the finishing steps applied to an
// outline (scallops, hand-drawn wobble, simplification). Everything is
// reused across generations and only allocates when a moth needs more room
// than any before it.

import { vlen } from './geom.js';
import { noise2 } from './noise.js';

export class Polyline {
  /** @param {number} [capacity] */
  constructor(capacity = 512) {
    /** x and y interleaved; only the first 2n entries are meaningful */
    this.xy = new Float64Array(capacity * 2);
    this.n = 0;
  }

  reset() {
    this.n = 0;
    return this;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  push(x, y) {
    if (this.n * 2 === this.xy.length) {
      const next = new Float64Array(this.xy.length * 2);
      next.set(this.xy);
      this.xy = next;
    }
    this.xy[2 * this.n] = x;
    this.xy[2 * this.n + 1] = y;
    this.n++;
  }
}

/**
 * One coordinate of a cubic Bézier.
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 * @param {number} t
 */
function bez(a, b, c, d, t) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

// Each edge record: 4 control points (8 numbers), then the parameter range
// [ta, tb] of the cubic that the edge actually uses.
const REC = 10;

/**
 * A closed outline described the way an illustrator would: a loop of
 * edges (costa, termen, dorsum...) joined at corners (apex, tornus...),
 * each corner rounded by its own radius. Edges are listed so the loop
 * runs clockwise on screen (y down).
 */
export class EdgeLoop {
  constructor() {
    this.e = new Float64Array(REC * 16);
    /** Radius of the rounding at the end of edge i (the corner to edge i+1). */
    this.r = new Float64Array(16);
    this.count = 0;
    // Per-edge working values for sample().
    this.len = new Float64Array(16);
    this.t0 = new Float64Array(16);
    this.t1 = new Float64Array(16);
    /**
     * After sample(): mark[i] is the index of the first vertex of edge i, so
     * vertices mark[i] .. mark[i+1]-1 are edge i followed by its end corner.
     */
    this.mark = new Int32Array(17);
    /** After sample(): corner[i] is the index of the first vertex of the corner at the end of edge i. */
    this.corner = new Int32Array(16);
  }

  reset() {
    this.count = 0;
    return this;
  }

  /**
   * Adds the part [ta, tb] of a cubic Bézier as the next edge.
   * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
   * @param {number} x2 @param {number} y2 @param {number} x3 @param {number} y3
   * @param {number} round radius of the corner at the end of this edge
   * @param {number} [ta] @param {number} [tb]
   */
  cubic(x0, y0, x1, y1, x2, y2, x3, y3, round, ta = 0, tb = 1) {
    const i = this.count++;
    const e = this.e;
    const o = i * REC;
    e[o] = x0; e[o + 1] = y0; e[o + 2] = x1; e[o + 3] = y1;
    e[o + 4] = x2; e[o + 5] = y2; e[o + 6] = x3; e[o + 7] = y3;
    e[o + 8] = ta; e[o + 9] = tb;
    this.r[i] = round;
  }

  /**
   * Adds an edge from (x0, y0) to (x3, y3) that bows outward. b1 and b2 set
   * how far the first and second thirds of the edge bow, as a fraction of
   * its length (negative bows inward). Outward is to the left of travel,
   * which for a clockwise loop is outside the shape.
   * @param {number} x0 @param {number} y0 @param {number} x3 @param {number} y3
   * @param {number} b1 @param {number} b2
   * @param {number} round radius of the corner at the end of this edge
   * @param {number} [ta] use only part [ta, tb] of the curve
   * @param {number} [tb]
   */
  bulge(x0, y0, x3, y3, b1, b2, round, ta = 0, tb = 1) {
    const dx = x3 - x0;
    const dy = y3 - y0;
    // (dy, -dx) is the left-hand normal scaled by the edge length.
    this.cubic(
      x0, y0,
      x0 + dx / 3 + dy * b1, y0 + dy / 3 - dx * b1,
      x0 + (2 * dx) / 3 + dy * b2, y0 + (2 * dy) / 3 - dx * b2,
      x3, y3, round, ta, tb,
    );
  }

  /**
   * Point at parameter t of the edge bulge() would make. Used to find
   * where to attach something partway along an edge (a hindwing tail).
   * @param {number} x0 @param {number} y0 @param {number} x3 @param {number} y3
   * @param {number} b1 @param {number} b2 @param {number} t
   * @param {Float64Array} out receives x, y at out[0], out[1]
   */
  static bulgePoint(x0, y0, x3, y3, b1, b2, t, out) {
    const dx = x3 - x0;
    const dy = y3 - y0;
    out[0] = bez(x0, x0 + dx / 3 + dy * b1, x0 + (2 * dx) / 3 + dy * b2, x3, t);
    out[1] = bez(y0, y0 + dy / 3 - dx * b1, y0 + (2 * dy) / 3 - dx * b2, y3, t);
  }

  /**
   * Samples the loop into `out` as a closed polyline (last point not
   * repeated), about `step` units between points. Each corner is replaced
   * by a quadratic curve that starts `r` before the corner on the incoming
   * edge, ends `r` after it on the outgoing edge, and uses the corner
   * itself as its control point.
   * @param {Polyline} out
   * @param {number} step
   */
  sample(out, step) {
    const { e, r, len, t0, t1, count } = this;
    out.reset();
    // Edge lengths (12 chords is plenty for these gentle curves), then the
    // parameter range left after trimming the corner roundings.
    for (let i = 0; i < count; i++) {
      const o = i * REC;
      const ta = e[o + 8];
      const tb = e[o + 9];
      let l = 0;
      let px = bez(e[o], e[o + 2], e[o + 4], e[o + 6], ta);
      let py = bez(e[o + 1], e[o + 3], e[o + 5], e[o + 7], ta);
      for (let k = 1; k <= 12; k++) {
        const t = ta + ((tb - ta) * k) / 12;
        const x = bez(e[o], e[o + 2], e[o + 4], e[o + 6], t);
        const y = bez(e[o + 1], e[o + 3], e[o + 5], e[o + 7], t);
        l += vlen(x - px, y - py);
        px = x;
        py = y;
      }
      len[i] = l;
    }
    for (let i = 0; i < count; i++) {
      const o = i * REC;
      const ta = e[o + 8];
      const tb = e[o + 9];
      const rin = r[(i + count - 1) % count];
      const rout = r[i];
      // Never trim more than 45% from either end, so short edges survive.
      t0[i] = ta + (tb - ta) * Math.min(0.45, rin / len[i]);
      t1[i] = tb - (tb - ta) * Math.min(0.45, rout / len[i]);
    }

    for (let i = 0; i < count; i++) {
      const o = i * REC;
      this.mark[i] = out.n;
      // The trimmed edge. Its first point is the end of the previous
      // corner, so skip it except on the very first edge.
      const span = t1[i] - t0[i];
      const tbSpan = e[o + 9] - e[o + 8];
      const steps = Math.max(1, Math.ceil((len[i] * span) / tbSpan / step));
      for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
        const t = t0[i] + (span * k) / steps;
        out.push(bez(e[o], e[o + 2], e[o + 4], e[o + 6], t), bez(e[o + 1], e[o + 3], e[o + 5], e[o + 7], t));
      }
      // The rounded corner into the next edge.
      this.corner[i] = out.n;
      const j = (i + 1) % count;
      const q = j * REC;
      const tb = e[o + 9];
      const cx = bez(e[o], e[o + 2], e[o + 4], e[o + 6], tb);
      const cy = bez(e[o + 1], e[o + 3], e[o + 5], e[o + 7], tb);
      const sx = out.xy[2 * out.n - 2];
      const sy = out.xy[2 * out.n - 1];
      const ex = bez(e[q], e[q + 2], e[q + 4], e[q + 6], t0[j]);
      const ey = bez(e[q + 1], e[q + 3], e[q + 5], e[q + 7], t0[j]);
      const cornerLen = vlen(cx - sx, cy - sy) + vlen(ex - cx, ey - cy);
      const cs = Math.max(1, Math.ceil(cornerLen / step));
      // On the last corner, stop short: the loop's first point closes it.
      const last = j === 0 ? cs - 1 : cs;
      for (let k = 1; k <= last; k++) {
        const t = k / cs;
        const u = 1 - t;
        out.push(u * u * sx + 2 * u * t * cx + t * t * ex, u * u * sy + 2 * u * t * cy + t * t * ey);
      }
    }
    this.mark[count] = out.n;
  }
}

// Scratch for the outline finishing steps.
let dx = new Float64Array(4096);
let dy = new Float64Array(4096);
let keep = new Uint8Array(4096);
let stack = new Int32Array(8192);

/** @param {number} n */
function ensure(n) {
  if (n <= dx.length) return;
  dx = new Float64Array(n * 2);
  dy = new Float64Array(n * 2);
  keep = new Uint8Array(n * 2);
  stack = new Int32Array(n * 4);
}

/**
 * Unit normal at vertex i, pointing left of travel (outside, for a loop
 * that runs clockwise on screen). Written to dx[i], dy[i].
 * @param {Float64Array} xy @param {number} n @param {boolean} closed @param {number} i
 */
function normalAt(xy, n, closed, i) {
  const a = i > 0 ? i - 1 : closed ? n - 1 : 0;
  const b = i < n - 1 ? i + 1 : closed ? 0 : n - 1;
  const tx = xy[2 * b] - xy[2 * a];
  const ty = xy[2 * b + 1] - xy[2 * a + 1];
  const l = vlen(tx, ty) || 1;
  dx[i] = ty / l;
  dy[i] = -tx / l;
}

/**
 * Scallops: the margin bulges outward between `count` evenly spaced cusps
 * along vertices [from, to). Real moths are scalloped between vein ends,
 * and the veins are placed to end at these cusps.
 * @param {Polyline} pl @param {number} from @param {number} to
 * @param {number} count @param {number} depth  model units
 */
export function scallop(pl, from, to, count, depth) {
  if (depth <= 0 || to - from < 3) return;
  const xy = pl.xy;
  ensure(pl.n);
  let total = 0;
  for (let i = from + 1; i < to; i++) total += vlen(xy[2 * i] - xy[2 * i - 2], xy[2 * i + 1] - xy[2 * i - 1]);
  for (let i = from; i < to; i++) normalAt(xy, pl.n, true, i);
  let s = 0;
  for (let i = from; i < to; i++) {
    if (i > from) s += vlen(xy[2 * i] - xy[2 * i - 2], xy[2 * i + 1] - xy[2 * i - 1]);
    const f = (s / total) * count;
    const d = depth * Math.pow(Math.sin(Math.PI * (f - Math.floor(f))), 0.6);
    // Store the move; apply after all normals are taken from the original.
    dx[i] *= d;
    dy[i] *= d;
  }
  for (let i = from; i < to; i++) {
    xy[2 * i] += dx[i];
    xy[2 * i + 1] += dy[i];
  }
}

/**
 * Hand-drawn wobble: moves every vertex along its normal by smooth noise,
 * at most `amp` units, with bumps about `wavelength` units apart. `row`
 * picks a different stretch of noise so two lines do not wobble alike.
 * @param {Polyline} pl @param {boolean} closed
 * @param {number} amp @param {number} wavelength @param {number} row
 */
export function roughen(pl, closed, amp, wavelength, row) {
  const n = pl.n;
  const xy = pl.xy;
  ensure(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) s += vlen(xy[2 * i] - xy[2 * i - 2], xy[2 * i + 1] - xy[2 * i - 1]);
    normalAt(xy, n, closed, i);
    const d = amp * (2 * noise2(s / wavelength, row) - 1);
    dx[i] *= d;
    dy[i] *= d;
  }
  for (let i = 0; i < n; i++) {
    xy[2 * i] += dx[i];
    xy[2 * i + 1] += dy[i];
  }
}

/**
 * Copies a closed polyline into `dst`, keeping only the vertices needed to
 * stay within `eps` units of the original (Douglas-Peucker, with an
 * explicit stack instead of recursion). Long gentle curves shrink to a
 * handful of points; tight scallops keep theirs.
 * @param {Polyline} src @param {Polyline} dst @param {number} eps
 */
export function simplifyClosed(src, dst, eps) {
  const n = src.n;
  const xy = src.xy;
  ensure(n);
  keep.fill(0, 0, n);
  // Anchor the loop at vertex 0 and the vertex farthest from it.
  let far = 0;
  let best = -1;
  for (let i = 1; i < n; i++) {
    const d = (xy[2 * i] - xy[0]) ** 2 + (xy[2 * i + 1] - xy[1]) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  keep[0] = keep[far] = 1;
  let sp = 0;
  stack[sp++] = 0;
  stack[sp++] = far;
  stack[sp++] = far;
  stack[sp++] = n; // index n stands for vertex 0 again
  const eps2 = eps * eps;
  while (sp > 0) {
    const b = stack[--sp];
    const a = stack[--sp];
    if (b - a < 2) continue;
    const ax = xy[2 * a];
    const ay = xy[2 * a + 1];
    const bi = b % n;
    const ex = xy[2 * bi] - ax;
    const ey = xy[2 * bi + 1] - ay;
    const l2 = ex * ex + ey * ey || 1e-12;
    let m = -1;
    let dmax = eps2;
    for (let i = a + 1; i < b; i++) {
      const px = xy[2 * i] - ax;
      const py = xy[2 * i + 1] - ay;
      // Squared distance from the vertex to the chord's line.
      const c = px * ey - py * ex;
      const d = (c * c) / l2;
      if (d > dmax) {
        dmax = d;
        m = i;
      }
    }
    if (m >= 0) {
      keep[m] = 1;
      stack[sp++] = a;
      stack[sp++] = m;
      stack[sp++] = m;
      stack[sp++] = b;
    }
  }
  dst.reset();
  for (let i = 0; i < n; i++) if (keep[i]) dst.push(xy[2 * i], xy[2 * i + 1]);
}

/**
 * A closed outline around a centre line: out along one side and back along
 * the other, at half-width widthAt(t) from the start (t = 0) to the end
 * (t = 1). Used for tapering antennae and for wing marks.
 * @param {Polyline} line @param {Polyline} out
 * @param {(t: number) => number} widthAt
 */
export function outlineAround(line, out, widthAt) {
  const xy = line.xy;
  const n = line.n;
  out.reset();
  for (let pass = 0; pass < 2; pass++) {
    const side = pass === 0 ? 1 : -1;
    for (let k = 0; k < n; k++) {
      const i = pass === 0 ? k : n - 1 - k;
      const w = Math.max(0, widthAt(i / (n - 1)));
      const j0 = i > 0 ? i - 1 : i;
      const j1 = i < n - 1 ? i + 1 : i;
      const tx = xy[2 * j1] - xy[2 * j0];
      const ty = xy[2 * j1 + 1] - xy[2 * j0 + 1];
      const tl = vlen(tx, ty) || 1;
      out.push(xy[2 * i] - (ty / tl) * w * side, xy[2 * i + 1] + (tx / tl) * w * side);
    }
  }
}
