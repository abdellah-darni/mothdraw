/**
 * Writes the visible parts of a polyline.
 * @param {Builder} b
 * @param {number} layer
 * @param {boolean} mirror
 * @param {Float64Array} xy  x and y interleaved
 * @param {number} n         vertex count
 * @param {boolean} closed   also draw the segment from the last vertex to the first
 * @param {Occluder | null} inside  keep only what is inside this shape (null: no limit)
 * @param {readonly Occluder[]} occ  shapes in front, front-most first
 */
export function drawVisible(b: Builder, layer: number, mirror: boolean, xy: Float64Array, n: number, closed: boolean, inside: Occluder | null, occ: readonly Occluder[]): void;
/**
 * A short stroke of two or three points (the bulk of all texture).
 * @param {Builder} b @param {number} layer @param {boolean} mirror
 * @param {number} x0 @param {number} y0
 * @param {number} x1 @param {number} y1
 * @param {number} x2 @param {number} y2  pass NaN for a two-point stroke
 * @param {Occluder | null} inside
 * @param {readonly Occluder[]} occ
 */
export function drawStroke(b: Builder, layer: number, mirror: boolean, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, inside: Occluder | null, occ: readonly Occluder[]): void;
export type Builder = import("./builder.js").Builder;
export type Occluder = import("./shapes.js").BandShape | import("./shapes.js").ProfileShape;
