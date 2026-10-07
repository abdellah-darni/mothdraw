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
export function buildForewing(w: Wing, p: Plan["fore"], look: Plan["look"], L: number, bx: number, by: number, rng: Rng): void;
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
 * @returns {number} y of the anal angle (the abdomen's length is set from it)
 */
export function buildHindwing(w: Wing, p: Plan["hind"], fore: Plan["fore"], look: Plan["look"], L: number, bx: number, by: number, fx: number, fy: number, rng: Rng): number;
/**
 * One wing, ready for drawing and for clipping against.
 *
 * Wing-local coordinates (u, v) place the pattern: u runs from 0 at the
 * base to 1 at the termen, v from 0 at the apex end of the termen to 1 at
 * the tornus end. A point (u, v) lies `u` of the way from the base to the
 * termen point at fraction `v` of the termen's length.
 */
export class Wing {
    /** The outline at full resolution; working copy. */
    fine: Polyline;
    /** The drawn outline: `fine` simplified. Also the inside test. */
    outline: Polyline;
    shape: BandShape;
    /** Fringe hairs as pairs of points: x0, y0, x1, y1, ... */
    fringe: Polyline;
    /** Termen sampled at K+1 evenly spaced points, before scallops and wobble. */
    mx: Float64Array<ArrayBuffer>;
    my: Float64Array<ArrayBuffer>;
    /** Angle of each termen point seen from the base, increasing. */
    ma: Float64Array<ArrayBuffer>;
    bx: number;
    by: number;
    /** Scallops on the termen; veins end at v = j / scallops. */
    scallops: number;
    /** Length of the termen, and the base-to-termen distance at mid-termen. */
    termenLength: number;
    radius: number;
    /**
     * Builds the termen table from vertex ranges [a1, b1) and [a2, b2) of the
     * fine outline (the second range is empty unless a tail splits the
     * termen; the jump across the tail root is bridged by a straight line).
     * @param {number} a1 @param {number} b1 @param {number} a2 @param {number} b2
     */
    setTermen(a1: number, b1: number, a2: number, b2: number): void;
    /**
     * Termen point at fraction v, extended in a straight line beyond 0 and 1
     * so bands can run slightly past the corners and be clipped there.
     * @param {number} v
     * @param {Float64Array} out
     */
    termenAt(v: number, out: Float64Array): void;
    /**
     * (u, v) → (x, y).
     * @param {number} u @param {number} v
     * @param {Float64Array} out receives x, y
     */
    toXY(u: number, v: number, out: Float64Array): void;
    /**
     * (x, y) → (u, v): the point's angle from the base gives v (a binary
     * search in the angle table), its distance gives u.
     * @param {number} x @param {number} y
     * @param {Float64Array} out receives u, v
     */
    toUV(x: number, y: number, out: Float64Array): void;
    /**
     * Fringe hairs: short strokes straight out from the termen, every
     * FRINGE_GAP units along vertices [a, b) of the finished fine outline,
     * each a little different in length and angle.
     * @param {number} a @param {number} b @param {number} len @param {Rng} rng
     */
    addFringe(a: number, b: number, len: number, rng: Rng): void;
    /**
     * Final steps shared by both wings: wobble, fringe, simplify, index.
     * @param {number} a1 @param {number} b1 @param {number} a2 @param {number} b2  termen ranges
     * @param {number} fringe  hair length
     * @param {Rng} rng
     * @param {number} row     noise row for the wobble
     */
    finish(a1: number, b1: number, a2: number, b2: number, fringe: number, rng: Rng, row: number): void;
}
export type Plan = import("./plans.js").Plan;
export type Rng = import("./rng.js").Rng;
import { Polyline } from './polyline.js';
import { BandShape } from './shapes.js';
