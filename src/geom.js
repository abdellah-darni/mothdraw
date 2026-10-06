// @ts-check
// Small numeric helpers shared by the generator and the renderers.
// Points are passed as separate numbers, never as [x, y] arrays, so these
// helpers allocate nothing.

export const TAU = Math.PI * 2;

/**
 * Default line weight for both renderers, in drawing units: 1.5 px on a
 * 900 px wide plate (the frame is 1000 units wide), scaling with the plate.
 */
export const LINE_WIDTH = (1.5 * 1000) / 900;

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 0 below e0, 1 above e1, smooth S-curve in between.
 * @param {number} e0
 * @param {number} e1
 * @param {number} v
 */
export function smoothstep(e0, e1, v) {
  const t = clamp((v - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Length of polyline `line` in a packed drawing.
 * @param {Float32Array} points
 * @param {Uint32Array} offsets
 * @param {number} line
 */
export function lineLength(points, offsets, line) {
  let len = 0;
  for (let v = offsets[line] + 1; v < offsets[line + 1]; v++) {
    len += Math.hypot(points[2 * v] - points[2 * v - 2], points[2 * v + 1] - points[2 * v - 1]);
  }
  return len;
}

/**
 * Uniform scale and offset that fit the box [minX, maxX] × [minY, maxY],
 * centred, inside the target rectangle [left, right] × [top, bottom].
 * Writes into `out` so callers can reuse one object.
 * @param {number} minX @param {number} minY @param {number} maxX @param {number} maxY
 * @param {number} left @param {number} top @param {number} right @param {number} bottom
 * @param {{ scale: number, x: number, y: number }} out
 */
export function fitBox(minX, minY, maxX, maxY, left, top, right, bottom, out) {
  const bw = Math.max(maxX - minX, 1e-6);
  const bh = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((right - left) / bw, (bottom - top) / bh);
  out.scale = scale;
  out.x = (left + right - bw * scale) / 2 - minX * scale;
  out.y = (top + bottom - bh * scale) / 2 - minY * scale;
  return out;
}
