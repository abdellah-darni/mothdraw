/**
 * Length of the vector (dx, dy). Math.hypot does the same but is several
 * times slower in V8, and this runs once or more per point.
 * @param {number} dx
 * @param {number} dy
 */
export function vlen(dx: number, dy: number): number;
/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
export function lerp(a: number, b: number, t: number): number;
/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 */
export function clamp(v: number, lo: number, hi: number): number;
/**
 * 0 below e0, 1 above e1, smooth S-curve in between.
 * @param {number} e0
 * @param {number} e1
 * @param {number} v
 */
export function smoothstep(e0: number, e1: number, v: number): number;
/**
 * Length of polyline `line` in a packed drawing.
 * @param {Float32Array} points
 * @param {Uint32Array} offsets
 * @param {number} line
 */
export function lineLength(points: Float32Array, offsets: Uint32Array, line: number): number;
/**
 * Uniform scale and offset that fit the box [minX, maxX] × [minY, maxY],
 * centred, inside the target rectangle [left, right] × [top, bottom].
 * Writes into `out` so callers can reuse one object.
 * @param {number} minX @param {number} minY @param {number} maxX @param {number} maxY
 * @param {number} left @param {number} top @param {number} right @param {number} bottom
 * @param {{ scale: number, x: number, y: number }} out
 */
export function fitBox(minX: number, minY: number, maxX: number, maxY: number, left: number, top: number, right: number, bottom: number, out: {
    scale: number;
    x: number;
    y: number;
}): {
    scale: number;
    x: number;
    y: number;
};
export const TAU: number;
/**
 * Default line weight for both renderers, in drawing units: 1.5 px on a
 * 900 px wide plate (the frame is 1000 units wide), scaling with the plate.
 */
export const LINE_WIDTH: number;
