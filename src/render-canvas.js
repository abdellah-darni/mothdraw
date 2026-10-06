// @ts-check
// Drawing -> Canvas 2D. These functions only build and stroke a path: the
// caller owns the canvas, its size, pixel ratio and stroke style. Nothing
// here allocates, so it is safe to call every frame.

/** @typedef {import('./builder.js').Drawing} Drawing */

/**
 * @typedef {object} Fit
 * @property {number} scale  canvas units per drawing unit
 * @property {number} x      offset added after scaling
 * @property {number} y
 */

/**
 * Scale and offset that centre the drawing's frame inside a box.
 * @param {Drawing} drawing
 * @param {number} boxWidth   in canvas units (CSS px times pixel ratio, or
 *                            CSS px if the context is already scaled)
 * @param {number} boxHeight
 * @param {Fit} [out] reused if given
 * @returns {Fit}
 */
export function fitDrawing(drawing, boxWidth, boxHeight, out = { scale: 1, x: 0, y: 0 }) {
  const scale = Math.min(boxWidth / drawing.width, boxHeight / drawing.height);
  out.scale = scale;
  out.x = (boxWidth - drawing.width * scale) / 2;
  out.y = (boxHeight - drawing.height * scale) / 2;
  return out;
}

/**
 * Strokes polylines [fromLine, toLine) in one path. Points are transformed
 * here rather than with ctx.scale, so lineWidth stays in canvas units.
 * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
 * @param {Drawing} drawing
 * @param {Fit} fit
 * @param {number} [fromLine]
 * @param {number} [toLine]  default: all lines
 */
export function drawDrawing(ctx, drawing, fit, fromLine = 0, toLine = drawing.offsets.length - 1) {
  const { points, offsets } = drawing;
  const { scale, x: ox, y: oy } = fit;
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
