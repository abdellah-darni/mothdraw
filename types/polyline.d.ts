/**
 * Scallops: the margin bulges outward between `count` evenly spaced cusps
 * along vertices [from, to). Real moths are scalloped between vein ends,
 * and the veins are placed to end at these cusps.
 * @param {Polyline} pl @param {number} from @param {number} to
 * @param {number} count @param {number} depth  model units
 */
export function scallop(pl: Polyline, from: number, to: number, count: number, depth: number): void;
/**
 * Hand-drawn wobble: moves every vertex along its normal by smooth noise,
 * at most `amp` units, with bumps about `wavelength` units apart. `row`
 * picks a different stretch of noise so two lines do not wobble alike.
 * @param {Polyline} pl @param {boolean} closed
 * @param {number} amp @param {number} wavelength @param {number} row
 */
export function roughen(pl: Polyline, closed: boolean, amp: number, wavelength: number, row: number): void;
/**
 * Copies a closed polyline into `dst`, keeping only the vertices needed to
 * stay within `eps` units of the original (Douglas-Peucker, with an
 * explicit stack instead of recursion). Long gentle curves shrink to a
 * handful of points; tight scallops keep theirs.
 * @param {Polyline} src @param {Polyline} dst @param {number} eps
 */
export function simplifyClosed(src: Polyline, dst: Polyline, eps: number): void;
/**
 * A closed outline around a centre line: out along one side and back along
 * the other, at half-width widthAt(t) from the start (t = 0) to the end
 * (t = 1). Used for tapering antennae and for wing marks.
 * @param {Polyline} line @param {Polyline} out
 * @param {(t: number) => number} widthAt
 */
export function outlineAround(line: Polyline, out: Polyline, widthAt: (t: number) => number): void;
export class Polyline {
    /** @param {number} [capacity] */
    constructor(capacity?: number);
    /** x and y interleaved; only the first 2n entries are meaningful */
    xy: Float64Array<ArrayBuffer>;
    n: number;
    reset(): this;
    /**
     * @param {number} x
     * @param {number} y
     */
    push(x: number, y: number): void;
}
/**
 * A closed outline described the way an illustrator would: a loop of
 * edges (costa, termen, dorsum...) joined at corners (apex, tornus...),
 * each corner rounded by its own radius. Edges are listed so the loop
 * runs clockwise on screen (y down).
 */
export class EdgeLoop {
    /**
     * Point at parameter t of the edge bulge() would make. Used to find
     * where to attach something partway along an edge (a hindwing tail).
     * @param {number} x0 @param {number} y0 @param {number} x3 @param {number} y3
     * @param {number} b1 @param {number} b2 @param {number} t
     * @param {Float64Array} out receives x, y at out[0], out[1]
     */
    static bulgePoint(x0: number, y0: number, x3: number, y3: number, b1: number, b2: number, t: number, out: Float64Array): void;
    e: Float64Array<ArrayBuffer>;
    /** Radius of the rounding at the end of edge i (the corner to edge i+1). */
    r: Float64Array<ArrayBuffer>;
    count: number;
    len: Float64Array<ArrayBuffer>;
    t0: Float64Array<ArrayBuffer>;
    t1: Float64Array<ArrayBuffer>;
    /**
     * After sample(): mark[i] is the index of the first vertex of edge i, so
     * vertices mark[i] .. mark[i+1]-1 are edge i followed by its end corner.
     */
    mark: Int32Array<ArrayBuffer>;
    /** After sample(): corner[i] is the index of the first vertex of the corner at the end of edge i. */
    corner: Int32Array<ArrayBuffer>;
    reset(): this;
    /**
     * Adds the part [ta, tb] of a cubic Bézier as the next edge.
     * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
     * @param {number} x2 @param {number} y2 @param {number} x3 @param {number} y3
     * @param {number} round radius of the corner at the end of this edge
     * @param {number} [ta] @param {number} [tb]
     */
    cubic(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, round: number, ta?: number, tb?: number): void;
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
    bulge(x0: number, y0: number, x3: number, y3: number, b1: number, b2: number, round: number, ta?: number, tb?: number): void;
    /**
     * Samples the loop into `out` as a closed polyline (last point not
     * repeated), about `step` units between points. Each corner is replaced
     * by a quadratic curve that starts `r` before the corner on the incoming
     * edge, ends `r` after it on the outgoing edge, and uses the corner
     * itself as its control point.
     * @param {Polyline} out
     * @param {number} step
     */
    sample(out: Polyline, step: number): void;
}
