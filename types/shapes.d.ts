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
    constructor(capacity?: number);
    x: Float64Array<ArrayBuffer>;
    y: Float64Array<ArrayBuffer>;
    n: number;
    /** start[b] .. start[b+1] index into `edges` for band b */
    start: Int32Array<ArrayBuffer>;
    edges: Int32Array<ArrayBuffer>;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    bandH: number;
    /**
     * @param {Polyline} pl closed polyline
     */
    set(pl: Polyline): void;
    /**
     * @param {number} px
     * @param {number} py
     */
    contains(px: number, py: number): boolean;
    /**
     * Same contract as ProfileShape.crossing. Checks the edges in the bands
     * that the bracketing interval touches.
     * @param {number} ax @param {number} ay @param {number} bx @param {number} by
     * @param {number} hx @param {number} hy
     * @param {number} tLo @param {number} tHi
     */
    crossing(ax: number, ay: number, bx: number, by: number, hx: number, hy: number, tLo: number, tHi: number): number;
}
/**
 * A shape symmetric about x = 0, given as a half-width for each row of a
 * fixed vertical spacing: head, thorax, abdomen. Between rows the edge is
 * the straight segment joining them, which is exactly what is drawn.
 */
export class ProfileShape {
    /** @param {number} [capacity] */
    constructor(capacity?: number);
    /** Half-width of each row; set the rows, then call finish(). */
    w: Float64Array<ArrayBuffer>;
    n: number;
    y0: number;
    dy: number;
    maxW: number;
    /**
     * Prepares rows from y0 to y0 + length, about `spacing` apart. Returns
     * the row count; fill this.w[0 .. count-1], with zero at both ends, then
     * call finish().
     * @param {number} y0 @param {number} length @param {number} spacing
     */
    reset(y0: number, length: number, spacing: number): number;
    finish(): void;
    /**
     * @param {number} px
     * @param {number} py
     */
    contains(px: number, py: number): boolean;
    /**
     * Same contract as StarShape.crossing.
     * @param {number} ax @param {number} ay @param {number} bx @param {number} by
     * @param {number} hx @param {number} hy
     * @param {number} tLo @param {number} tHi
     */
    crossing(ax: number, ay: number, bx: number, by: number, hx: number, hy: number, tLo: number, tHi: number): number;
    /**
     * Writes the closed outline: down the right side, back up the left.
     * @param {Polyline} out
     */
    outline(out: Polyline): void;
}
export type Polyline = import("./polyline.js").Polyline;
