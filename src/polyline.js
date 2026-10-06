// @ts-check
// Scratch geometry: a growable point list, and closed outlines built from
// curved edges with rounded corners. Both are reused across generations,
// so they only allocate when a moth needs more room than any before it.

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
        l += Math.hypot(x - px, y - py);
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
      const j = (i + 1) % count;
      const q = j * REC;
      const tb = e[o + 9];
      const cx = bez(e[o], e[o + 2], e[o + 4], e[o + 6], tb);
      const cy = bez(e[o + 1], e[o + 3], e[o + 5], e[o + 7], tb);
      const sx = out.xy[2 * out.n - 2];
      const sy = out.xy[2 * out.n - 1];
      const ex = bez(e[q], e[q + 2], e[q + 4], e[q + 6], t0[j]);
      const ey = bez(e[q + 1], e[q + 3], e[q + 5], e[q + 7], t0[j]);
      const cornerLen = Math.hypot(cx - sx, cy - sy) + Math.hypot(ex - cx, ey - cy);
      const cs = Math.max(1, Math.ceil(cornerLen / step));
      // On the last corner, stop short: the loop's first point closes it.
      const last = j === 0 ? cs - 1 : cs;
      for (let k = 1; k <= last; k++) {
        const t = k / cs;
        const u = 1 - t;
        out.push(u * u * sx + 2 * u * t * cx + t * t * ex, u * u * sy + 2 * u * t * cy + t * t * ey);
      }
    }
  }
}
