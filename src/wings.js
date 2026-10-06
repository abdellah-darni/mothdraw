// @ts-check
// Wings built from their landmarks, the way entomologists describe them:
//
//   base ── costa (leading edge) ──▶ apex
//     ╲                                │ termen (outer margin)
//      ╲── dorsum (inner margin) ──◀ tornus
//
// Each margin is a gently bowed curve between two landmarks, and each
// corner is rounded by its own radius. Only the right wings are built; the
// builder mirrors them.

import { EdgeLoop } from './polyline.js';

/** @typedef {import('./polyline.js').Polyline} Polyline */
/** @typedef {import('./plans.js').Plan} Plan */

/**
 * Outline sampling, in model units. One model unit is 1.05 to 1.35 frame
 * units, so 0.7 keeps vertices under 1 frame unit apart (DESIGN.md §3.2).
 */
const STEP = 0.7;
const DEG = Math.PI / 180;

const loop = new EdgeLoop();
const pt = new Float64Array(2);

/**
 * Forewing: a rounded triangle with a nearly straight costa. The apex lies
 * at `costaAngle` forward of the perpendicular to the body; the tornus at
 * the end of the inner margin, `dorsumAngle` behind it. Pinned specimens
 * are set with the inner margin close to the perpendicular, and the outer
 * margin then slopes back towards the body as on real moths.
 * @param {Plan['fore']} p
 * @param {number} L   costa length in model units
 * @param {number} bx  base, at the side of the thorax
 * @param {number} by
 * @param {Polyline} out  closed outline, clockwise on screen
 */
export function buildForewing(p, L, bx, by, out) {
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
  loop.sample(out, STEP);
}

/**
 * Hindwing: rounder, attached behind the forewing. Its front corner is
 * anchored to the forewing: a point `reach` of the way along the
 * forewing's inner margin, moved `tuck` forward so it lies hidden under
 * the forewing. The visible hindwing therefore always emerges from under
 * the forewing near its tornus, as on a set specimen. An optional tail
 * leaves the termen near the anal angle.
 * @param {Plan['hind']} p
 * @param {Plan['fore']} fore
 * @param {number} L   forewing costa length in model units
 * @param {number} bx  hindwing base
 * @param {number} by
 * @param {number} fx  forewing base
 * @param {number} fy
 * @param {Polyline} out
 */
export function buildHindwing(p, fore, L, bx, by, fx, fy, out) {
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
    const w = p.tailTip * L;
    const s1x = mx + ux * len * 0.88 + px * w;
    const s1y = my + uy * len * 0.88 + py * w;
    const s2x = mx + ux * len * 0.88 - px * w;
    const s2y = my + uy * len * 0.88 - py * w;
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
  loop.sample(out, STEP);
}
