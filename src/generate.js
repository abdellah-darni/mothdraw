// @ts-check
// The public generator: generate(seed, options) -> { drawing, name, seed }.
// Pure in the sense that matters: same seed, same output; no DOM, no I/O,
// no state visible from outside. It reuses module scratch memory between
// calls (DESIGN.md §5.1), which is safe because a call is synchronous.

import { Builder } from './builder.js';
import { seedNoise } from './noise.js';
import { hashSeed, stream } from './rng.js';
import { drawFrame, drawMoth } from './moth.js';
import { makeName } from './name.js';
import { samplePattern } from './pattern.js';
import { samplePlan } from './plans.js';

/** @typedef {import('./builder.js').Drawing} Drawing */
/** @typedef {import('./builder.js').Reuse} Reuse */

/**
 * @typedef {object} GenerateOptions
 * @property {Reuse} [reuse]  previous output arrays to write into, if they fit
 * @property {number} [density]  texture density: 1 is the default plate (about
 *   10,000 to 15,000 points); 0.5 gives roughly half the texture strokes
 */

/**
 * @typedef {object} Moth
 * @property {Drawing} drawing
 * @property {string} name   pseudo-Latin "Genus species" to show under the specimen
 * @property {string} family the real moth family whose body plan was used
 * @property {string | number} seed  the seed as given
 */

export const FRAME_WIDTH = 1000;
export const FRAME_HEIGHT = 750;

// Plate layout, in frame units: a ruled frame, the specimen centred in the
// box above, and the name below it (proportions of fishdraw's plates).
const FRAME_INSET = 22;
const BOX = Object.freeze({ left: 70, top: 58, right: 930, bottom: 650 });
const LABEL = Object.freeze({ x: FRAME_WIDTH / 2, y: 703, size: 24 });
const BOX_SIZE = Object.freeze({ width: BOX.right - BOX.left, height: BOX.bottom - BOX.top });
/**
 * Point budget at the default density. The darkest moths (about 1 in 100)
 * would exceed it; they are redrawn once with texture spacing loosened just
 * enough to fit, keeping every element.
 */
const POINT_BUDGET = 14500;

const builder = new Builder();

/**
 * @param {string | number} seed
 * @param {GenerateOptions} [options]
 * @returns {Moth}
 */
export function generate(seed, options = {}) {
  const seed32 = hashSeed(seed);
  seedNoise(stream(seed32, 'noise'));
  // Separate streams: changing how one part is drawn never changes the
  // others (a seed keeps its body plan, pattern and name).
  const plan = samplePlan(stream(seed32, 'plan'));
  const look = samplePattern(stream(seed32, 'pattern'), plan.family);
  const density = options.density ?? 1;
  draw(plan, look, seed32, density);
  const points = builder.outputVertexCount();
  const budget = POINT_BUDGET * density;
  // Only the texture scales with density; outlines, veins and body detail
  // (about a third of the points) do not, so the texture must shrink more.
  if (points > budget) draw(plan, look, seed32, density * Math.max(0.3, (budget - 0.35 * points) / (0.65 * points)));
  const drawing = builder.pack(FRAME_WIDTH, FRAME_HEIGHT, BOX, LABEL, options.reuse);
  return { drawing, name: makeName(stream(seed32, 'name'), plan.family), family: plan.family, seed };
}

/**
 * Draws the frame and the moth into the builder. A fresh detail stream
 * each time, so a redraw is as deterministic as the first.
 * @param {import('./plans.js').Plan} plan
 * @param {import('./pattern.js').Look} look
 * @param {number} seed32
 * @param {number} density
 */
function draw(plan, look, seed32, density) {
  builder.reset();
  drawFrame(builder, FRAME_WIDTH, FRAME_HEIGHT, FRAME_INSET);
  drawMoth(builder, plan, look, stream(seed32, 'detail'), BOX_SIZE, density);
}
