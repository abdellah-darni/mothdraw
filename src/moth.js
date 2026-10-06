// @ts-check
// Assembles one moth from a plan: builds every part, then draws each
// part's outline with the parts in front of it hiding what they cover.
//
// Depth, front to back: antennae, thorax, head, abdomen, forewing, hindwing.

import { drawAntenna } from './antennae.js';
import { buildBody } from './body.js';
import { LAYER } from './builder.js';
import { drawVisible } from './clip.js';
import { Polyline } from './polyline.js';
import { ProfileShape, StarShape } from './shapes.js';
import { buildForewing, buildHindwing } from './wings.js';

/** @typedef {import('./builder.js').Builder} Builder */
/** @typedef {import('./plans.js').Plan} Plan */

/** Forewing costa length in model units. Everything else scales from it. */
export const L = 400;

// Scratch shapes, reused for every moth.
const head = new ProfileShape();
const thorax = new ProfileShape();
const abdomen = new ProfileShape();
const forewing = new StarShape(2048);
const forePl = new Polyline(2048);
const hindPl = new Polyline(4096);
const bodyPl = new Polyline(1024);
const spine = new Polyline(64);
const antOutline = new Polyline(128);
const anchors = { foreX: 0, foreY: 0, hindX: 0, hindY: 0, antX: 0, antY: 0 };

// Who hides whom. Front-most first, so the cheap body tests run before the
// forewing's.
const NONE = /** @type {const} */ ([]);
const BEHIND_THORAX = [thorax];
const BEHIND_BODY = [thorax, head, abdomen];
const BEHIND_FOREWING = [thorax, abdomen, head, forewing];
const BEHIND_HEAD = [head];

/**
 * @param {Builder} b
 * @param {Plan} plan
 */
export function drawMoth(b, plan) {
  buildBody(plan.body, L, head, thorax, abdomen, anchors);
  buildForewing(plan.fore, L, anchors.foreX, anchors.foreY, forePl);
  forewing.set(forePl);
  buildHindwing(plan.hind, plan.fore, L, anchors.hindX, anchors.hindY, anchors.foreX, anchors.foreY, hindPl);

  // Body outlines are symmetric and drawn whole, so they are not mirrored.
  thorax.outline(bodyPl);
  drawVisible(b, LAYER.BODY, false, bodyPl.xy, bodyPl.n, true, NONE);
  head.outline(bodyPl);
  drawVisible(b, LAYER.BODY, false, bodyPl.xy, bodyPl.n, true, BEHIND_THORAX);
  abdomen.outline(bodyPl);
  drawVisible(b, LAYER.BODY, false, bodyPl.xy, bodyPl.n, true, BEHIND_THORAX);

  drawVisible(b, LAYER.WING, true, forePl.xy, forePl.n, true, BEHIND_BODY);
  drawVisible(b, LAYER.WING, true, hindPl.xy, hindPl.n, true, BEHIND_FOREWING);

  // Keep the antennae at least 12° forward of the costa.
  const maxAngle = ((90 - plan.fore.costaAngle - 12) * Math.PI) / 180;
  drawAntenna(b, plan.antenna, L, anchors.antX, anchors.antY, maxAngle, spine, antOutline, BEHIND_HEAD);
}

/** Exposed for tests: the forewing occluder of the last moth drawn. */
export function lastForewing() {
  return forewing;
}
