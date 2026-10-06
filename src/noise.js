// @ts-check
// Seeded value noise: random values on an integer grid, smoothly
// interpolated in between. Used for wobble and soft pattern edges.
//
// The value table is module scratch memory (DESIGN.md §5.1). Call seedNoise
// at the start of each generation; generation is synchronous, so one table
// per thread is enough.

/** @typedef {import('./rng.js').Rng} Rng */

const SIZE = 256;
const values = new Float32Array(SIZE);

/**
 * Refills the value table from a generator.
 * @param {Rng} rng
 */
export function seedNoise(rng) {
  for (let i = 0; i < SIZE; i++) values[i] = rng();
}

/**
 * Value at an integer grid point. The two coordinates are hashed together
 * and the top 8 bits pick a table entry.
 * @param {number} ix
 * @param {number} iy
 */
function lattice(ix, iy) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return values[h >>> 24];
}

/**
 * 2D value noise in [0, 1), smooth (C1) between grid points.
 * @param {number} x
 * @param {number} y
 */
export function noise2(x, y) {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const tx = x - fx;
  const ty = y - fy;
  // Smoothstep weights hide the grid lines that plain linear blending shows.
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = lattice(fx, fy);
  const b = lattice(fx + 1, fy);
  const c = lattice(fx, fy + 1);
  const d = lattice(fx + 1, fy + 1);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

/**
 * Sum of `octaves` layers of noise, each twice the frequency and half the
 * strength of the one before. Result in [0, 1).
 * @param {number} x
 * @param {number} y
 * @param {number} octaves
 */
export function fbm2(x, y, octaves) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise2(x, y) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2;
    y *= 2;
  }
  return sum / norm;
}
