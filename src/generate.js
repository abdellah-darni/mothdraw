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
 * @property {number} [density]  texture density: 1 is the default plate (about
 *   10,000 to 15,000 points); 0.5 gives roughly half the texture strokes
 * @property {boolean} [frame]  draw the ruled frame (default true). Without it
 *   the specimen fills more of the plate and the name sits just below it, for
 *   a moth placed directly on a page's background.
 * @property {Reuse} [reuse]  previous output arrays to write into, if they fit
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

// Plate layouts, in frame units.
//
// Framed: a ruled frame, the specimen centred in the box above, and the
// name at the bottom (proportions of fishdraw's plates).
const FRAME_INSET = 22;
const FRAMED = Object.freeze({
  box: Object.freeze({ left: 70, top: 58, right: 930, bottom: 650 }),
  minFill: 0.7,
});
const FRAMED_LABEL = Object.freeze({ x: FRAME_WIDTH / 2, y: 703, size: 24 });
// Without a frame: the specimen fills most of the plate, leaving room below
// for the name, which sits just under the specimen. Sizes vary less, so no
// moth looks lost on the page.
const BARE = Object.freeze({
  box: Object.freeze({ left: 24, top: 24, right: FRAME_WIDTH - 24, bottom: FRAME_HEIGHT - 70 }),
  minFill: 0.85,
});
const LABEL_SIZE = 24;
const LABEL_GAP = 16;

/**
 * Specimens are shown at their relative real size: a 25 mm moth fills
 * `minFill` of the box, a 125 mm one all of it.
 * @param {number} wingspan mm
 * @param {number} minFill
 */
function fillFor(wingspan, minFill) {
  return minFill + (1 - minFill) * Math.min(1, Math.max(0, (wingspan - 25) / 100));
}
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
  const framed = options.frame ?? true;
  const layout = framed ? FRAMED : BARE;
  // The box the specimen is fitted to, shrunk around its centre by size.
  const fill = fillFor(plan.wingspan, layout.minFill);
  const b = layout.box;
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  const hw = ((b.right - b.left) / 2) * fill;
  const hh = ((b.bottom - b.top) / 2) * fill;
  const box = { left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh };
  const size = { width: 2 * hw, height: 2 * hh };
  draw(plan, look, seed32, density, size, framed);
  const points = builder.outputVertexCount();
  const budget = POINT_BUDGET * density;
  // Only the texture scales with density; outlines, veins and body detail
  // (about a third of the points) do not, so the texture must shrink more.
  if (points > budget) {
    draw(plan, look, seed32, density * Math.max(0.3, (budget - 0.35 * points) / (0.65 * points)), size, framed);
  }
  const label = framed ? FRAMED_LABEL : { x: FRAME_WIDTH / 2, y: 0, size: LABEL_SIZE };
  const drawing = builder.pack(FRAME_WIDTH, FRAME_HEIGHT, box, label, options.reuse);
  if (!framed) nameBelow(drawing, builder.bounds);
  return { drawing, name: makeName(stream(seed32, 'name'), plan.family), family: plan.family, seed };
}

/**
 * Without a frame: puts the name a small gap below the specimen's lowest
 * point, then moves specimen and name together so the pair is centred
 * vertically on the plate.
 * @param {Drawing} drawing
 * @param {{ minY: number, maxY: number }} bounds  specimen bounds, frame units
 */
function nameBelow(drawing, bounds) {
  const baseline = bounds.maxY + LABEL_GAP + LABEL_SIZE * 0.8;
  const bottom = baseline + LABEL_SIZE * 0.25; // room for descenders
  const dy = (FRAME_HEIGHT - (bottom - bounds.minY)) / 2 - bounds.minY;
  const p = drawing.points;
  for (let i = 1; i < p.length; i += 2) p[i] += dy;
  drawing.label.y = baseline + dy;
}

/**
 * The main family a seed will produce, without generating the moth: only
 * the body plan is sampled, which takes microseconds. Continuous mode uses
 * it to avoid showing the same family twice in a row.
 * @param {string | number} seed
 * @returns {string}
 */
export function peekFamily(seed) {
  return samplePlan(stream(hashSeed(seed), 'plan')).family;
}

/**
 * Draws the frame (if any) and the moth into the builder. A fresh detail
 * stream each time, so a redraw is as deterministic as the first.
 * @param {import('./plans.js').Plan} plan
 * @param {import('./pattern.js').Look} look
 * @param {number} seed32
 * @param {number} density
 * @param {{ width: number, height: number }} size  the box the specimen will fill
 * @param {boolean} framed
 */
function draw(plan, look, seed32, density, size, framed) {
  builder.reset();
  if (framed) drawFrame(builder, FRAME_WIDTH, FRAME_HEIGHT, FRAME_INSET);
  drawMoth(builder, plan, look, stream(seed32, 'detail'), size, density);
}
