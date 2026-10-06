// @ts-check
// The public generator: generate(seed, options) -> { drawing, name, seed }.
// Pure in the sense that matters: same seed, same output; no DOM, no I/O,
// no state visible from outside. It reuses module scratch memory between
// calls (DESIGN.md §5.1), which is safe because a call is synchronous.

import { Builder } from './builder.js';
import { seedNoise } from './noise.js';
import { hashSeed, stream } from './rng.js';
import { drawMoth } from './moth.js';
import { samplePlan } from './plans.js';

/** @typedef {import('./builder.js').Drawing} Drawing */
/** @typedef {import('./builder.js').Reuse} Reuse */

/**
 * @typedef {object} GenerateOptions
 * @property {Reuse} [reuse]  previous output arrays to write into, if they fit
 */

/**
 * @typedef {object} Moth
 * @property {Drawing} drawing
 * @property {string} name   pseudo-Latin species name (stage 4; empty for now)
 * @property {string} family the real moth family whose body plan was used
 * @property {string | number} seed  the seed as given
 */

export const FRAME_WIDTH = 1000;
export const FRAME_HEIGHT = 750;
const FRAME_PAD = 30;

const builder = new Builder();

/**
 * @param {string | number} seed
 * @param {GenerateOptions} [options]
 * @returns {Moth}
 */
export function generate(seed, options = {}) {
  const seed32 = hashSeed(seed);
  seedNoise(stream(seed32, 'noise'));
  const plan = samplePlan(stream(seed32, 'plan'));
  builder.reset();
  drawMoth(builder, plan);
  const drawing = builder.pack(FRAME_WIDTH, FRAME_HEIGHT, FRAME_PAD, options.reuse);
  return { drawing, name: '', family: plan.family, seed };
}
