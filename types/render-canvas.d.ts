/** @typedef {import('./builder.js').Drawing} Drawing */
/**
 * @typedef {object} Fit
 * @property {number} scale      canvas units per drawing unit
 * @property {number} x          offset added after scaling
 * @property {number} y
 * @property {number} lineWidth  stroke width in canvas units
 */
/**
 * Scale and offset that centre the drawing's frame inside a box.
 * @param {Drawing} drawing
 * @param {number} boxWidth   in canvas units (CSS px times pixel ratio, or
 *                            CSS px if the context is already scaled)
 * @param {number} boxHeight
 * @param {number} [lineWidth] in drawing units (default LINE_WIDTH)
 * @param {Fit} [out] reused if given
 * @returns {Fit}
 */
export function fitDrawing(drawing: Drawing, boxWidth: number, boxHeight: number, lineWidth?: number, out?: Fit): Fit;
/**
 * Strokes polylines [fromLine, toLine) in one path, at the fit's line
 * width. Points are transformed here rather than with ctx.scale.
 * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
 * @param {Drawing} drawing
 * @param {Fit} fit
 * @param {number} [fromLine]
 * @param {number} [toLine]  default: all lines
 */
export function drawDrawing(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, drawing: Drawing, fit: Fit, fromLine?: number, toLine?: number): void;
/**
 * Draws the species name in italics at the drawing's label position, in
 * the given font family (pass the page's, e.g. getComputedStyle(el).fontFamily),
 * filled with the context's current fillStyle.
 * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
 * @param {Drawing} drawing
 * @param {Fit} fit
 * @param {string} text
 * @param {string} fontFamily
 */
export function drawLabel(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, drawing: Drawing, fit: Fit, text: string, fontFamily: string): void;
export type Drawing = import("./builder.js").Drawing;
export type Fit = {
    /**
     * canvas units per drawing unit
     */
    scale: number;
    /**
     * offset added after scaling
     */
    x: number;
    y: number;
    /**
     * stroke width in canvas units
     */
    lineWidth: number;
};
