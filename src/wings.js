// @ts-check
// Wings built from their landmarks, the way entomologists describe them:
//
//   base ── costa (leading edge) ──▶ apex
//     ╲                                │ termen (outer margin)
//      ╲── dorsum (inner margin) ──◀ tornus
//
// Each margin is a gently bowed curve between two landmarks, and each
// corner is rounded by its own radius. The outline is then finished like a
// drawing: scallops between the vein ends, a slight hand-drawn wobble, and
// fringe hairs along the termen. Only the right wings are built; the
// builder mirrors them.

import { EdgeLoop, Polyline, roughen, scallop, simplifyClosed } from './polyline.js';
import { BandShape } from './shapes.js';

/** @typedef {import('./plans.js').Plan} Plan */
/** @typedef {import('./rng.js').Rng} Rng */

/**
 * Outline sampling, in model units. One model unit is 1.05 to 1.35 frame
 * units, so 0.7 keeps vertices under 1 frame unit apart (DESIGN.md §3.2).
 */
const STEP = 0.7;
/** Simplification tolerance for the drawn outline, in model units. */
const EPS = 0.06;
/** Hand-drawn wobble: amplitude and bump spacing, model units. */
const WOBBLE = 0.35;
const WAVE = 38;
/** Fringe hairs: spacing along the margin, model units. */
const FRINGE_GAP = 2.4;
/** Intervals in the margin table behind the wing-local coordinates. */
const K = 48;
const DEG = Math.PI / 180;

const loop = new EdgeLoop();
const pt = new Float64Array(2);
const tmp = new Polyline(2048);
const cum = new Float64Array(4096);

/**
 * One wing, ready for drawing and for clipping against.
 *
 * Wing-local coordinates (u, v) place the pattern: u runs from 0 at the
 * base to 1 at the termen, v from 0 at the apex end of the termen to 1 at
 * the tornus end. A point (u, v) lies `u` of the way from the base to the
 * termen point at fraction `v` of the termen's length.
 */
export class Wing {
  constructor() {
    /** The outline at full resolution; working copy. */
    this.fine = new Polyline(4096);
    /** The drawn outline: `fine` simplified. Also the inside test. */
    this.outline = new Polyline(2048);
    this.shape = new BandShape(2048);
    /** Fringe hairs as pairs of points: x0, y0, x1, y1, ... */
    this.fringe = new Polyline(1024);
    /** Termen sampled at K+1 evenly spaced points, before scallops and wobble. */
    this.mx = new Float64Array(K + 1);
    this.my = new Float64Array(K + 1);
    /** Angle of each termen point seen from the base, increasing. */
    this.ma = new Float64Array(K + 1);
    this.bx = 0;
    this.by = 0;
    /** Scallops on the termen; veins end at v = j / scallops. */
    this.scallops = 1;
  }

  /**
   * Builds the termen table from vertex ranges [a1, b1) and [a2, b2) of the
   * fine outline (the second range is empty unless a tail splits the
   * termen; the jump across the tail root is bridged by a straight line).
   * @param {number} a1 @param {number} b1 @param {number} a2 @param {number} b2
   */
  setTermen(a1, b1, a2, b2) {
    const xy = this.fine.xy;
    tmp.reset();
    for (let i = a1; i < b1; i++) tmp.push(xy[2 * i], xy[2 * i + 1]);
    for (let i = a2; i < b2; i++) tmp.push(xy[2 * i], xy[2 * i + 1]);
    const n = tmp.n;
    const t = tmp.xy;
    cum[0] = 0;
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(t[2 * i] - t[2 * i - 2], t[2 * i + 1] - t[2 * i - 1]);
    let j = 0;
    for (let k = 0; k <= K; k++) {
      const target = (cum[n - 1] * k) / K;
      while (j < n - 2 && cum[j + 1] < target) j++;
      const f = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
      this.mx[k] = t[2 * j] + (t[2 * j + 2] - t[2 * j]) * f;
      this.my[k] = t[2 * j + 1] + (t[2 * j + 3] - t[2 * j + 1]) * f;
      this.ma[k] = Math.atan2(this.my[k] - this.by, this.mx[k] - this.bx);
    }
  }

  /**
   * Termen point at fraction v, extended in a straight line beyond 0 and 1
   * so bands can run slightly past the corners and be clipped there.
   * @param {number} v
   * @param {Float64Array} out
   */
  termenAt(v, out) {
    const f = v * K;
    let i = Math.floor(f);
    if (i < 0) i = 0;
    if (i > K - 1) i = K - 1;
    const t = f - i;
    out[0] = this.mx[i] + (this.mx[i + 1] - this.mx[i]) * t;
    out[1] = this.my[i] + (this.my[i + 1] - this.my[i]) * t;
  }

  /**
   * (u, v) → (x, y).
   * @param {number} u @param {number} v
   * @param {Float64Array} out receives x, y
   */
  toXY(u, v, out) {
    this.termenAt(v, out);
    out[0] = this.bx + u * (out[0] - this.bx);
    out[1] = this.by + u * (out[1] - this.by);
  }

  /**
   * (x, y) → (u, v): the point's angle from the base gives v (a binary
   * search in the angle table), its distance gives u.
   * @param {number} x @param {number} y
   * @param {Float64Array} out receives u, v
   */
  toUV(x, y, out) {
    const ma = this.ma;
    const a = Math.atan2(y - this.by, x - this.bx);
    let i;
    if (a <= ma[0]) i = 0;
    else if (a >= ma[K]) i = K - 1;
    else {
      let lo = 0;
      let hi = K;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (ma[mid] <= a) lo = mid;
        else hi = mid;
      }
      i = lo;
    }
    const v = (i + (a - ma[i]) / (ma[i + 1] - ma[i] || 1)) / K;
    this.termenAt(v, out);
    const r = Math.hypot(out[0] - this.bx, out[1] - this.by) || 1;
    out[0] = Math.hypot(x - this.bx, y - this.by) / r;
    out[1] = v;
  }

  /**
   * Fringe hairs: short strokes straight out from the termen, every
   * FRINGE_GAP units along vertices [a, b) of the finished fine outline,
   * each a little different in length and angle.
   * @param {number} a @param {number} b @param {number} len @param {Rng} rng
   */
  addFringe(a, b, len, rng) {
    const xy = this.fine.xy;
    const n = this.fine.n;
    let since = FRINGE_GAP;
    for (let i = a; i < b; i++) {
      if (i > a) since += Math.hypot(xy[2 * i] - xy[2 * i - 2], xy[2 * i + 1] - xy[2 * i - 1]);
      if (since < FRINGE_GAP) continue;
      since = 0;
      const p = (i + n - 1) % n;
      const q = (i + 1) % n;
      const tx = xy[2 * q] - xy[2 * p];
      const ty = xy[2 * q + 1] - xy[2 * p + 1];
      const tl = Math.hypot(tx, ty) || 1;
      // Outward normal, turned a few degrees at random.
      const j = (rng() - 0.5) * 0.35;
      const nx = (ty / tl) * Math.cos(j) - (-tx / tl) * Math.sin(j);
      const ny = (ty / tl) * Math.sin(j) + (-tx / tl) * Math.cos(j);
      const l = len * (0.65 + 0.7 * rng());
      const x = xy[2 * i];
      const y = xy[2 * i + 1];
      this.fringe.push(x + nx * 0.3, y + ny * 0.3);
      this.fringe.push(x + nx * l, y + ny * l);
    }
  }

  /**
   * Final steps shared by both wings: wobble, fringe, simplify, index.
   * @param {number} a1 @param {number} b1 @param {number} a2 @param {number} b2  termen ranges
   * @param {number} fringe  hair length
   * @param {Rng} rng
   * @param {number} row     noise row for the wobble
   */
  finish(a1, b1, a2, b2, fringe, rng, row) {
    roughen(this.fine, true, WOBBLE, WAVE, row);
    this.fringe.reset();
    this.addFringe(a1, b1, fringe, rng);
    if (b2 > a2) this.addFringe(a2, b2, fringe, rng);
    simplifyClosed(this.fine, this.outline, EPS);
    this.shape.set(this.outline);
  }
}

/**
 * Forewing: a rounded triangle with a nearly straight costa. The apex lies
 * at `costaAngle` forward of the perpendicular to the body; the tornus at
 * the end of the inner margin, `dorsumAngle` behind it. Pinned specimens
 * are set with the inner margin close to the perpendicular, and the outer
 * margin then slopes back towards the body as on real moths.
 * @param {Wing} w
 * @param {Plan['fore']} p
 * @param {Plan['look']} look
 * @param {number} L   costa length in model units
 * @param {number} bx  base, at the side of the thorax
 * @param {number} by
 * @param {Rng} rng
 */
export function buildForewing(w, p, look, L, bx, by, rng) {
  const ca = p.costaAngle * DEG;
  const da = p.dorsumAngle * DEG;
  const ax = bx + L * Math.cos(ca);
  const ay = by - L * Math.sin(ca); // forward is negative y
  const tx = bx + L * p.dorsumLength * Math.cos(da);
  const ty = by + L * p.dorsumLength * Math.sin(da);

  loop.reset();
  loop.bulge(bx, by, ax, ay, p.costaBow * 0.6, p.costaBow, p.apexRound * L);
  loop.bulge(ax, ay, tx, ty, p.termenBow1, p.termenBow2, p.tornusRound * L);
  loop.bulge(tx, ty, bx, by, p.dorsumBow, p.dorsumBow * 0.5, 0.02 * L);
  loop.sample(w.fine, STEP);

  // Edge 1 is the termen.
  const m = loop.mark;
  w.bx = bx;
  w.by = by;
  w.scallops = look.scallops;
  w.setTermen(m[1], m[2], 0, 0);
  scallop(w.fine, m[1], m[2], look.scallops, look.scallopDepth * L);
  w.finish(m[1], m[2], 0, 0, look.fringe * L, rng, 11.3);
}

/**
 * Hindwing: rounder, attached behind the forewing. Its front corner is
 * anchored to the forewing: a point `reach` of the way along the
 * forewing's inner margin, moved `tuck` forward so it lies hidden under
 * the forewing. The visible hindwing therefore always emerges from under
 * the forewing near its tornus, as on a set specimen. An optional tail
 * leaves the termen near the anal angle.
 * @param {Wing} w
 * @param {Plan['hind']} p
 * @param {Plan['fore']} fore
 * @param {Plan['look']} look
 * @param {number} L   forewing costa length in model units
 * @param {number} bx  hindwing base
 * @param {number} by
 * @param {number} fx  forewing base
 * @param {number} fy
 * @param {Rng} rng
 */
export function buildHindwing(w, p, fore, look, L, bx, by, fx, fy, rng) {
  const da = fore.dorsumAngle * DEG;
  const along = p.reach * fore.dorsumLength * L;
  const hx = fx + along * Math.cos(da);
  const hy = fy + along * Math.sin(da) - p.tuck * L;
  const aa = p.analAngle * DEG;
  const tx = bx + p.size * L * Math.cos(aa);
  const ty = by + p.size * L * Math.sin(aa);
  const tb = p.termenBow;

  loop.reset();
  loop.bulge(bx, by, hx, hy, 0.03, 0.03, p.apexRound * L);
  if (!p.tail) {
    loop.bulge(hx, hy, tx, ty, tb, tb, p.tornusRound * L);
  } else {
    // Split the termen around the tail root (R1 outer, R2 inner).
    const t1 = 0.6;
    const t2 = 0.72;
    EdgeLoop.bulgePoint(hx, hy, tx, ty, tb, tb, t1, pt);
    const r1x = pt[0];
    const r1y = pt[1];
    EdgeLoop.bulgePoint(hx, hy, tx, ty, tb, tb, t2, pt);
    const r2x = pt[0];
    const r2y = pt[1];
    // Tail axis from the root's midpoint, and the perpendicular that points
    // towards R1.
    const mx = (r1x + r2x) / 2;
    const my = (r1y + r2y) / 2;
    const ta = p.tailAngle * DEG;
    const ux = Math.cos(ta);
    const uy = Math.sin(ta);
    let px = -uy;
    let py = ux;
    if (px * (r1x - mx) + py * (r1y - my) < 0) {
      px = -px;
      py = -py;
    }
    // Two shoulders near the end and a round cap between them: the
    // spatulate tip of a luna moth's tail. A tiny tip width degenerates
    // the cap into a point, which gives the short tails of some geometrids.
    const len = p.tailLength * L;
    const tw = p.tailTip * L;
    const s1x = mx + ux * len * 0.88 + px * tw;
    const s1y = my + uy * len * 0.88 + py * tw;
    const s2x = mx + ux * len * 0.88 - px * tw;
    const s2y = my + uy * len * 0.88 - py * tw;
    const root = 0.03 * L;
    const tiny = 0.005 * L;
    loop.bulge(hx, hy, tx, ty, tb, tb, root, 0, t1);
    // Sides bow inward, so the tail is slimmest before it reaches the tip.
    loop.bulge(r1x, r1y, s1x, s1y, -0.03, -0.02, tiny);
    loop.bulge(s1x, s1y, s2x, s2y, 0.75, 0.75, tiny);
    loop.bulge(s2x, s2y, r2x, r2y, -0.02, -0.03, root * 1.8);
    loop.bulge(hx, hy, tx, ty, tb, tb, p.tornusRound * L, t2, 1);
  }
  loop.bulge(tx, ty, bx, by, p.innerBow, p.innerBow, 0.02 * L);
  loop.sample(w.fine, STEP);

  // The termen is edge 1, or edges 1 and 5 when a tail (edges 2-4) splits it.
  const m = loop.mark;
  const a2 = p.tail ? m[5] : 0;
  const b2 = p.tail ? m[6] : 0;
  w.bx = bx;
  w.by = by;
  w.scallops = look.scallops;
  w.setTermen(m[1], m[2], a2, b2);
  scallop(w.fine, m[1], m[2], p.tail ? Math.max(2, Math.round(look.scallops * 0.6)) : look.scallops, look.scallopDepth * L);
  if (p.tail) scallop(w.fine, a2, b2, 2, look.scallopDepth * L);
  w.finish(m[1], m[2], a2, b2, look.fringe * L, rng, 23.7);
}
