// @ts-check
// Drawing -> Canvas 2D. These functions build and stroke a path; the
// caller owns the canvas, its size, pixel ratio and colour. Nothing here
// allocates, so it is safe to call every frame.

import { LINE_WIDTH } from './geom.js';

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
export function fitDrawing(drawing, boxWidth, boxHeight, lineWidth = LINE_WIDTH, out = { scale: 1, x: 0, y: 0, lineWidth: 1 }) {
  const scale = Math.min(boxWidth / drawing.width, boxHeight / drawing.height);
  out.scale = scale;
  out.lineWidth = lineWidth * scale;
  out.x = (boxWidth - drawing.width * scale) / 2;
  out.y = (boxHeight - drawing.height * scale) / 2;
  return out;
}

/**
 * Strokes polylines [fromLine, toLine) in one path, at the fit's line
 * width. Points are transformed here rather than with ctx.scale.
 * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
 * @param {Drawing} drawing
 * @param {Fit} fit
 * @param {number} [fromLine]
 * @param {number} [toLine]  default: all lines
 */
export function drawDrawing(ctx, drawing, fit, fromLine = 0, toLine = drawing.offsets.length - 1) {
  const { points, offsets } = drawing;
  const { scale, x: ox, y: oy } = fit;
  ctx.lineWidth = fit.lineWidth;
  ctx.beginPath();
  for (let l = fromLine; l < toLine; l++) {
    const a = offsets[l];
    const b = offsets[l + 1];
    ctx.moveTo(points[2 * a] * scale + ox, points[2 * a + 1] * scale + oy);
    for (let v = a + 1; v < b; v++) {
      ctx.lineTo(points[2 * v] * scale + ox, points[2 * v + 1] * scale + oy);
    }
  }
  ctx.stroke();
}

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
export function drawLabel(ctx, drawing, fit, text, fontFamily) {
  const { x, y, size } = drawing.label;
  ctx.font = `italic ${size * fit.scale}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x * fit.scale + fit.x, y * fit.scale + fit.y);
}
