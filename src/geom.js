// @ts-check
// Small numeric helpers shared by the generator and the renderers.
// Points are passed as separate numbers, never as [x, y] arrays, so these
// helpers allocate nothing.

export const TAU = Math.PI * 2;

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
 * Uniform scale and offset that fit the box [minX, maxX] × [minY, maxY]
 * centred inside a `width` × `height` frame with `pad` on every side.
 * Writes into `out` so callers can reuse one object.
 * @param {number} minX
 * @param {number} minY
 * @param {number} maxX
 * @param {number} maxY
 * @param {number} width
 * @param {number} height
 * @param {number} pad
 * @param {{ scale: number, x: number, y: number }} out
 */
export function fitBox(minX, minY, maxX, maxY, width, height, pad, out) {
  const bw = Math.max(maxX - minX, 1e-6);
  const bh = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((width - 2 * pad) / bw, (height - 2 * pad) / bh);
  out.scale = scale;
  out.x = (width - bw * scale) / 2 - minX * scale;
  out.y = (height - bh * scale) / 2 - minY * scale;
  return out;
}
