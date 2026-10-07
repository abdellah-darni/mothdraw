// @ts-check
// Making the next moth for continuous mode: pick a seed, generate, measure
// its ink. Shared by the worker (worker.js) and by mount's main-thread
// fallback, which loads this module only if the worker cannot be used.

import { generate, peekFamily } from './generate.js';
import { vlen } from './geom.js';

/**
 * @typedef {object} MothRequest
 * @property {string | null} base   fixed seed sequence (base, base-1, base-2...), or null for random seeds
 * @property {number} index         next index in the fixed sequence
 * @property {string | null} avoid  main family to avoid (the moth on screen)
 * @property {number} density
 * @property {Float32Array} [points]  previous moth's arrays, sent back for reuse
 * @property {Uint32Array} [offsets]
 */

/**
 * @typedef {object} MothReply
 * @property {string} seed
 * @property {string} name
 * @property {string} family
 * @property {number} index      where the fixed sequence continues
 * @property {import('./builder.js').Drawing} drawing
 * @property {number} total      total ink length, for the fixed-time pen
 */

/** A random six-character seed. Seeds only; the generator never uses this. */
function randomSeed() {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return n[0].toString(36).padStart(6, '0').slice(-6);
}

/**
 * @param {MothRequest} req
 * @returns {MothReply}
 */
export function makeMoth(req) {
  let index = req.index;
  let seed = '';
  // Never the same main family twice in a row. Checking a seed's family
  // samples only its body plan, so a rejected seed costs microseconds.
  for (let tries = 0; tries < 50; tries++) {
    seed = req.base === null ? randomSeed() : index === 0 ? req.base : `${req.base}-${index}`;
    index++;
    if (peekFamily(seed) !== req.avoid) break;
  }
  const moth = generate(seed, { density: req.density, reuse: { points: req.points, offsets: req.offsets } });
  const { points, offsets } = moth.drawing;
  // Total ink length: the pen draws it at constant speed in a fixed time.
  let total = 0;
  for (let l = 0; l < offsets.length - 1; l++) {
    for (let v = offsets[l] + 1; v < offsets[l + 1]; v++) {
      total += vlen(points[2 * v] - points[2 * v - 2], points[2 * v + 1] - points[2 * v - 1]);
    }
  }
  return { seed, name: moth.name, family: moth.family, index, drawing: moth.drawing, total };
}
