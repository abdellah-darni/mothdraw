// @ts-check
// TEMPORARY (stage 1 only): a seeded, mirrored test pattern that exercises
// the whole pipeline (PRNG, noise, builder, mirroring, packing, renderers)
// with roughly the point count of a finished moth. Replaced by the moth in
// stage 2.

import { LAYER } from './builder.js';
import { lerp, TAU } from './geom.js';
import { noise2 } from './noise.js';
import { int, uniform } from './rng.js';

/** @typedef {import('./builder.js').Builder} Builder */
/** @typedef {import('./rng.js').Rng} Rng */

/**
 * @param {Builder} b
 * @param {Rng} rng
 */
export function drawTestcard(b, rng) {
  // A lobe on the right of the axis: outline radius as a function of angle
  // around a base point, like the wings will be.
  const bx = 20;
  const R = uniform(rng, 250, 400);
  const lobes = int(rng, 3, 7);
  const a0 = -1.3;
  const a1 = 1.3;
  /** @param {number} a */
  const radius = (a) => R * (0.75 + 0.25 * Math.cos(a * lobes)) * (0.85 + 0.3 * noise2(a * 2, 7.3));

  // Outline and four inner rings at fractions of the radius.
  for (let k = 1; k <= 5; k++) {
    const u = k / 5;
    b.begin(k === 5 ? LAYER.WING : LAYER.VEIN);
    for (let i = 0; i <= 600; i++) {
      const a = lerp(a0, a1, i / 600);
      const r = radius(a) * u;
      b.point(bx + Math.cos(a) * r, Math.sin(a) * r);
    }
    b.end();
  }

  // Rays from the base.
  for (let i = 0; i <= 12; i++) {
    const a = lerp(a0, a1, i / 12);
    const r = radius(a);
    b.begin(LAYER.VEIN);
    b.point(bx, 0);
    b.point(bx + Math.cos(a) * r, Math.sin(a) * r);
    b.end();
  }

  // Stipple on a jittered grid, kept where the point is inside the lobe and
  // a noise pattern is dark.
  const step = 9;
  for (let gy = -R; gy < R; gy += step) {
    for (let gx = bx; gx < bx + R; gx += step) {
      const x = gx + rng() * step;
      const y = gy + rng() * step;
      const a = Math.atan2(y, x - bx);
      if (a < a0 || a > a1) continue;
      if (Math.hypot(x - bx, y) > radius(a)) continue;
      if (noise2(x * 0.02, y * 0.02) < 0.5) continue;
      const t = rng() * TAU;
      b.begin(LAYER.PATTERN);
      b.point(x, y);
      b.point(x + Math.cos(t) * 1.5, y + Math.sin(t) * 1.5);
      b.end();
    }
  }

  // A body on the axis, drawn whole and not mirrored.
  b.begin(LAYER.BODY, false);
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * TAU;
    b.point(Math.cos(t) * 18, Math.sin(t) * R * 0.6);
  }
  b.end();
}
